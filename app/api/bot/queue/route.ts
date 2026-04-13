import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { getCountry } from '@/lib/bot-config'

export async function GET(request: Request) {
  if (!await getAuthUser()) return unauthorizedResponse()

  const botUrl = process.env.BOT_SERVER_URL
  if (!botUrl) {
    return Response.json(
      { error: 'BOT_SERVER_URL não configurado' },
      { status: 503 },
    )
  }

  const { searchParams } = new URL(request.url)
  const market = searchParams.get('market') || 'BR'

  // Look up country config to send niches + cities as source of truth
  const countryConfig = getCountry(market)

  try {
    const res = await fetch(`${botUrl}/api/bot/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.BOT_SERVER_SECRET ?? ''}`,
      },
      body: JSON.stringify({
        market,
        niches: countryConfig
          ? countryConfig.niches.flatMap(g => [...g.items])
          : undefined,
        cities: countryConfig ? [...countryConfig.cities] : undefined,
        lang: countryConfig?.lang,
      }),
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
