import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

interface BotParams {
  niche: string
  city: string
  limit: number
  min_score: number
  lang: string
  export_target: string
  dry_run: boolean
  send: boolean
}

export async function POST(request: NextRequest) {
  const params: BotParams = await request.json()

  const botUrl = process.env.BOT_SERVER_URL
  if (!botUrl) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"line":"⚠️  BOT_SERVER_URL não está configurado. Defina a variável de ambiente no .env.local","type":"error"}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  // Create bot_run record
  const supabase = createServiceClient()
  const { data: run } = await supabase
    .from('bot_runs')
    .insert({
      niche: params.niche,
      city: params.city,
      limit_count: params.limit,
      min_score: params.min_score,
      lang: params.lang,
      export_target: params.export_target,
      dry_run: params.dry_run,
      send: params.send,
      status: 'running',
    })
    .select('id')
    .single()

  const runId = run?.id
  const runStartedAt = Date.now()

  // Call bot server
  try {
    const botResponse = await fetch(`${botUrl}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.BOT_SERVER_SECRET ?? ''}`,
      },
      body: JSON.stringify(params),
    })

    if (!botResponse.ok || !botResponse.body) {
      // Update run as failed
      if (runId) {
        await supabase
          .from('bot_runs')
          .update({ status: 'failed', finished_at: new Date().toISOString() })
          .eq('id', runId)
      }

      const encoder = new TextEncoder()
      const errMsg = `Erro ao conectar com bot server: ${botResponse.status} ${botResponse.statusText}`
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: {"line":"❌ ${errMsg}","type":"error"}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // Pipe SSE stream from bot server back to client, tracking completion
    const botBody = botResponse.body
    const reader = botBody.getReader()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    let collected = 0
    let qualified = 0
    let sent = 0
    let lastSyncedSent = 0
    const logLines: string[] = []

    // Sync conversations for recently sent leads — called periodically during stream
    async function syncNewlySentLeads() {
      try {
        const runStart = new Date(runStartedAt).toISOString()
        const { data: sentLeads } = await supabase
          .from('leads')
          .select('place_id, message, outreach_sent_at, outreach_channel')
          .eq('outreach_sent', true)
          .gte('outreach_sent_at', runStart)
          .not('message', 'is', null)

        if (!sentLeads || sentLeads.length === 0) return

        const placeIds = sentLeads.map(l => l.place_id)
        const { data: existingConvs } = await supabase
          .from('conversations')
          .select('place_id, message')
          .in('place_id', placeIds)
          .eq('direction', 'out')

        const existingKeys = new Set(
          (existingConvs ?? []).map(c => `${c.place_id}::${c.message}`)
        )
        const missing = sentLeads.filter(
          l => !existingKeys.has(`${l.place_id}::${l.message}`)
        )

        if (missing.length > 0) {
          console.log('[bot/run] syncing', missing.length, 'outreach conversations')
          await supabase.from('conversations').insert(
            missing.map(l => ({
              place_id: l.place_id,
              direction: 'out' as const,
              channel: (l.outreach_channel ?? 'whatsapp') as string,
              message: l.message,
              sent_at: l.outreach_sent_at ?? new Date().toISOString(),
              suggested_by_ai: false,
            })),
          )
        }
      } catch (err) {
        console.error('[bot/run] conversation sync failed:', err)
      }
    }

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) {
          // Final sync for any remaining unsaved conversations
          await syncNewlySentLeads()

          // Finalize run
          if (runId) {
            const durationSeconds = Math.round((Date.now() - runStartedAt) / 1000)
            await supabase
              .from('bot_runs')
              .update({
                status: 'completed',
                finished_at: new Date().toISOString(),
                duration_seconds: durationSeconds,
                collected,
                qualified,
                sent,
                log: logLines.join('\n'),
              })
              .eq('id', runId)
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          return
        }

        // Parse lines for stats
        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const parsed = JSON.parse(line.slice(6))
              const msg: string = parsed.line ?? ''
              if (msg) logLines.push(msg)
              if (msg.includes('collected')) {
                const m = msg.match(/(\d+)\s*collected/)
                if (m) collected = parseInt(m[1])
              }
              if (msg.includes('qualified')) {
                const m = msg.match(/(\d+)\s*qualified/)
                if (m) qualified = parseInt(m[1])
              }
              if (msg.includes('sent')) {
                const m = msg.match(/(\d+)\s*sent/)
                if (m) sent = parseInt(m[1])
              }
            } catch {
              // Not valid JSON, pass through
            }
          }
        }

        // Progressive sync: when sent count increases, sync conversations immediately
        // so they appear in inbox without waiting for the run to finish
        if (sent > lastSyncedSent) {
          lastSyncedSent = sent
          syncNewlySentLeads().catch(() => {})
        }

        controller.enqueue(value)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    if (runId) {
      await supabase
        .from('bot_runs')
        .update({ status: 'failed', finished_at: new Date().toISOString() })
        .eq('id', runId)
    }

    const encoder = new TextEncoder()
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: {"line":"❌ ${errMsg}","type":"error"}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }
}
