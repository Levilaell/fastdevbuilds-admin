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

  // Create bot_run record
  const supabase = createServiceClient()
  const { data: run } = await supabase
    .from('bot_runs')
    .insert({
      status: 'running',
    })
    .select('id')
    .single()

  try {
    const cc = getCountry(params.market)
    const botResponse = await fetch(`${botUrl}/run-auto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.BOT_SERVER_SECRET ?? ''}`,
      },
      body: JSON.stringify({
        ...params,
        ...(cc ? {
          niches: cc.niches.flatMap(g => [...g.items]),
          cities: [...cc.cities],
          lang: cc.lang,
        } : {}),
        evolutionInstances: getInstances().map(i => ({
          name: i.name,
          apiKey: i.apiKey,
        })),
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
