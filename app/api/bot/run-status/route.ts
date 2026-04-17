import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { backfillWhatsappJidsForRun } from '@/lib/leads/backfill-jid'

export async function GET(request: Request) {
  if (!await getAuthUser()) return unauthorizedResponse()

  const botUrl = process.env.BOT_SERVER_URL
  if (!botUrl) {
    return Response.json({ error: 'BOT_SERVER_URL não configurado' }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const serverRunId = searchParams.get('runId') ?? ''
  const offset = searchParams.get('offset') ?? '0'
  const botRunId = searchParams.get('botRunId') ?? ''

  try {
    const res = await fetch(
      `${botUrl}/run-status?runId=${serverRunId}&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.BOT_SERVER_SECRET ?? ''}`,
        },
      },
    )

    if (!res.ok) {
      return Response.json({ error: `Bot server: ${res.status}` }, { status: res.status })
    }

    const data = await res.json()

    // Update bot_runs record with latest stats when run completes
    if (botRunId && (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled')) {
      const supabase = createServiceClient()

      // Get run start time for scoping follow-up scheduling
      const { data: runRecord } = await supabase
        .from('bot_runs')
        .select('started_at')
        .eq('id', botRunId)
        .single()

      await supabase
        .from('bot_runs')
        .update({
          status: data.status === 'cancelled' ? 'failed' : data.status,
          finished_at: new Date().toISOString(),
          duration_seconds: data.durationSeconds ?? null,
          collected: data.stats?.collected ?? null,
          qualified: data.stats?.qualified ?? null,
          sent: data.stats?.sent ?? null,
          log: data.logs?.join?.('\n') ?? null,
        })
        .eq('id', botRunId)

      // Schedule follow-ups for leads sent during this run that don't have one yet
      if (runRecord?.started_at && data.status === 'completed') {
        // Backfill last_outbound_at + clear outreach_error on bot-sent leads
        // (bot writes outreach_sent_at but not the operational fields).
        await supabase
          .from('leads')
          .update({
            last_outbound_at: runRecord.started_at,
            outreach_error: null,
          })
          .eq('outreach_sent', true)
          .gte('outreach_sent_at', runRecord.started_at)
          .is('last_outbound_at', null)

        const followUpAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        await supabase
          .from('leads')
          .update({
            follow_up_count: 0,
            next_follow_up_at: followUpAt,
          })
          .eq('outreach_sent', true)
          .gte('outreach_sent_at', runRecord.started_at)
          .is('next_follow_up_at', null)
          .or('follow_up_paused.is.null,follow_up_paused.eq.false')

        // Backfill whatsapp_jid for leads sent during this run (bot path
        // never writes it, and Evolution echo matching is racy).
        await backfillWhatsappJidsForRun(supabase, runRecord.started_at)
      }
    }

    return Response.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro de conexão'
    return Response.json({ error: message }, { status: 502 })
  }
}
