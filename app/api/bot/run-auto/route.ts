import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { getCountry } from '@/lib/bot-config'
import { getInstances } from '@/lib/whatsapp'

interface AutoParams {
  limit: number
  min_score: number
  dry_run: boolean
  send: boolean
  market: string
  max_send?: number
  /**
   * Hard cap on how many Projects to create in this US-WA run. Each Project
   * costs ~$0.72 (Opus prompt + Getimg images), so without a cap the full
   * queue can burn hundreds of dollars. Sent as --max-projects to the bot.
   */
  max_projects?: number
  /**
   * Per-instance send cap for this run. Keys are Evolution instance names,
   * values are non-negative integers. When set, the bot stops sending on
   * each instance once its count is reached. Unknown names or negative
   * values are rejected with 400 to avoid silently no-op runs.
   */
  per_instance_send?: Record<string, number>
  /**
   * Optional UI override of the campaign's `qualificationFilters`. Replaces
   * the bot-config defaults for this run only — used to calibrate filters
   * during validation without redeploying. Shape mirrors QualificationFilters
   * from lib/bot-config.ts; partial overrides allowed (UI fields not set
   * fall back to defaults on the client side).
   */
  qualification_filters?: {
    minRating?: number
    recentReviewMonths?: number
    requireOperational?: boolean
    franchiseBlacklist?: string[]
  }
  /**
   * When true, bot drops with-website leads after collect+phone-filter and
   * processes only no-website leads. Skips analyze/visual/score entirely
   * on the with-website pile — cheap pivot-v2 path that avoids the per-lead
   * Claude + PageSpeed spend when the offer only targets sites-from-zero.
   */
  no_website_only?: boolean
}

export async function POST(request: NextRequest) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const params: AutoParams = await request.json()

  const botUrl = process.env.BOT_SERVER_URL
  if (!botUrl) {
    return Response.json(
      { error: 'BOT_SERVER_URL não está configurado' },
      { status: 503 },
    )
  }

  // Create bot_run record. campaign_code stamps which experiment this run
  // belongs to; the bot-server propagates it onto every lead it upserts.
  // See GTM_LAB_ARCHITECTURE.md and supabase/migrations/20260428_experiment_tracking.sql.
  const supabase = createServiceClient()
  const { data: run } = await supabase
    .from('bot_runs')
    .insert({
      status: 'running',
      campaign_code: params.market,
    })
    .select('id')
    .single()

  // Validate per_instance_send — defense in depth. UI already validates,
  // but other callers (cron, curl, future scripts) hit the same endpoint.
  const instances = getInstances()
  const knownNames = new Set(instances.map(i => i.name))
  if (params.per_instance_send) {
    for (const [name, val] of Object.entries(params.per_instance_send)) {
      if (!knownNames.has(name)) {
        if (run?.id) {
          await supabase
            .from('bot_runs')
            .update({ status: 'failed', finished_at: new Date().toISOString() })
            .eq('id', run.id)
        }
        return Response.json(
          { error: `per_instance_send: unknown instance '${name}'` },
          { status: 400 },
        )
      }
      if (!Number.isInteger(val) || val < 0) {
        if (run?.id) {
          await supabase
            .from('bot_runs')
            .update({ status: 'failed', finished_at: new Date().toISOString() })
            .eq('id', run.id)
        }
        return Response.json(
          {
            error: `per_instance_send: '${name}' must be a non-negative integer (got ${val})`,
          },
          { status: 400 },
        )
      }
    }
  }

  try {
    const cc = getCountry(params.market)
    // Enrich each instance with its per-run cap (undefined means no cap).
    const evolutionInstances = instances.map(i => ({
      name: i.name,
      apiKey: i.apiKey,
      ...(params.per_instance_send && params.per_instance_send[i.name] !== undefined
        ? { maxThisRun: params.per_instance_send[i.name] }
        : {}),
    }))

    const botResponse = await fetch(`${botUrl}/run-auto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.BOT_SERVER_SECRET ?? ''}`,
      },
      body: JSON.stringify({
        ...params,
        // Experiment tracking. Bot-server is expected to:
        //   1. propagate campaign_code onto every upserted lead (COALESCE on
        //      conflict so first run wins),
        //   2. stamp bot_run_id onto every lead it creates this run.
        // If bot-server doesn't yet read these, the fields are inert — admin
        // side still records campaign_code on bot_runs above.
        campaign_code: params.market,
        ...(run?.id ? { bot_run_id: run.id } : {}),
        ...(params.no_website_only ? { noWebsiteOnly: true } : {}),
        ...(cc ? {
          niches: cc.niches.flatMap(g => [...g.items]),
          cities: [...cc.cities],
          lang: cc.lang,
          country: cc.country,
          channel: cc.channel,
          // Qualification filters: UI override (params.qualification_filters)
          // wins over bot-config defaults. UI fields left empty already fell
          // back to defaults on the client (resolveQualificationFilters in
          // bot-client.tsx), so by the time we get here, the body either has
          // a complete override object or none at all.
          ...(params.qualification_filters
            ? { qualificationFilters: params.qualification_filters }
            : cc.qualificationFilters
              ? { qualificationFilters: cc.qualificationFilters }
              : {}),
        } : {}),
        evolutionInstances,
        evolutionApiUrl: process.env.EVOLUTION_API_URL,
      }),
    })

    if (!botResponse.ok) {
      const errText = await botResponse.text().catch(() => String(botResponse.status))
      if (run?.id) {
        await supabase
          .from('bot_runs')
          .update({ status: 'failed', finished_at: new Date().toISOString() })
          .eq('id', run.id)
      }
      return Response.json({ error: `Bot server: ${errText}` }, { status: botResponse.status })
    }

    const data = await botResponse.json()

    // Store bot-server runId in bot_runs for polling
    if (run?.id && data.runId) {
      await supabase
        .from('bot_runs')
        .update({ server_run_id: data.runId })
        .eq('id', run.id)
    }

    return Response.json({
      botRunId: run?.id,
      serverRunId: data.runId,
    })
  } catch (err) {
    if (run?.id) {
      await supabase
        .from('bot_runs')
        .update({ status: 'failed', finished_at: new Date().toISOString() })
        .eq('id', run.id)
    }
    const message = err instanceof Error ? err.message : 'Erro de conexão'
    return Response.json({ error: message }, { status: 502 })
  }
}
