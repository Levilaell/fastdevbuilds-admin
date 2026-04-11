import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'

export async function POST() {
  if (!await getAuthUser()) return unauthorizedResponse()
  const botUrl = process.env.BOT_SERVER_URL
  if (!botUrl) {
    return Response.json({ error: 'BOT_SERVER_URL not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`${botUrl}/cancel`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${process.env.BOT_SERVER_SECRET ?? ''}`,
      },
    })

    if (!res.ok) {
      return Response.json(
        { error: `Bot server returned ${res.status}` },
        { status: res.status },
      )
    }

    return Response.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reach bot server'
    return Response.json({ error: message }, { status: 502 })
  }
}
