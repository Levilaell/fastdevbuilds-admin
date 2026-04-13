import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'

interface AutoParams {
  limit: number
  min_score: number
  dry_run: boolean
  send: boolean
  market: string
}

export async function POST(request: NextRequest) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const params: AutoParams = await request.json()

  const botUrl = process.env.BOT_SERVER_URL
  if (!botUrl) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"line":"⚠️  BOT_SERVER_URL não está configurado.","type":"error"}\n\n'))
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

  // Create bot_run record for the auto run
  const supabase = createServiceClient()
  const { data: run } = await supabase
    .from('bot_runs')
    .insert({
      niche: '__auto__',
      city: '__auto__',
      limit_count: params.limit,
      min_score: params.min_score,
      dry_run: params.dry_run,
      send: params.send,
      status: 'running',
    })
    .select('id')
    .single()

  const runId = run?.id
  const runStartedAt = Date.now()

  try {
    const botResponse = await fetch(`${botUrl}/run-auto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.BOT_SERVER_SECRET ?? ''}`,
      },
      body: JSON.stringify(params),
    })

    if (!botResponse.ok || !botResponse.body) {
      if (runId) {
        await supabase
          .from('bot_runs')
          .update({ status: 'failed', finished_at: new Date().toISOString() })
          .eq('id', runId)
      }

      const encoder = new TextEncoder()
      const errMsg = `Erro ao conectar: ${botResponse.status} ${botResponse.statusText}`
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

    // Pipe SSE stream
    const reader = botResponse.body.getReader()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    let collected = 0
    let qualified = 0
    let sent = 0
    const logLines: string[] = []

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) {
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

        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const parsed = JSON.parse(line.slice(6))
              const msg: string = parsed.line ?? ''
              if (msg) logLines.push(msg)
              const collectedMatch = msg.match(/(\d+)\s*collected/)
              if (collectedMatch) collected = parseInt(collectedMatch[1])
              const qualifiedMatch = msg.match(/(\d+)\s*qualified/)
              if (qualifiedMatch) qualified = parseInt(qualifiedMatch[1])
              const sentMatch = msg.match(/(\d+)\s*sent/)
              if (sentMatch) sent = parseInt(sentMatch[1])
            } catch { /* pass */ }
          }
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
