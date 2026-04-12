import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'

export async function GET(request: Request) {
  if (!await getAuthUser()) return unauthorizedResponse()

  const botUrl = process.env.BOT_SERVER_URL
  if (!botUrl) {
    return Response.json(
      { error: 'BOT_SERVER_URL não configurado' },
      { status: 503 },
    )
  }

  // Forward market filter to bot server
  const { searchParams } = new URL(request.url)
  const market = searchParams.get('market') || 'all'

  try {
    const res = await fetch(`${botUrl}/api/bot/queue?market=${market}`, {
      headers: {
        Authorization: `Bearer ${process.env.BOT_SERVER_SECRET ?? ''}`,
      },
    })

    if (!res.ok) {
      return Response.json(
        { error: `Bot server retornou ${res.status}` },
        { status: res.status },
      )
    }

    const data = await res.json()
    return Response.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro de conexão'
    return Response.json({ error: message }, { status: 502 })
  }
}
