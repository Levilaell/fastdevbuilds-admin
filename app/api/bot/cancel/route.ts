import { NextRequest } from 'next/server'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: NextRequest) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const botUrl = process.env.BOT_SERVER_URL
  if (!botUrl) {
    return Response.json({ error: 'BOT_SERVER_URL not configured' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const { runId, botRunId } = body as { runId?: string; botRunId?: string }

  try {
    const res = await fetch(`${botUrl}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.BOT_SERVER_SECRET ?? ''}`,
      },
      body: JSON.stringify({ runId }),
    })

    if (!res.ok) {
      return Response.json(
        { error: `Bot server returned ${res.status}` },
        { status: res.status },
      )
    }

    // Update bot_runs record
    if (botRunId) {
      const supabase = createServiceClient()
      await supabase
        .from('bot_runs')
        .update({ status: 'failed', finished_at: new Date().toISOString() })
        .eq('id', botRunId)
    }

    return Response.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reach bot server'
    return Response.json({ error: message }, { status: 502 })
  }
}
