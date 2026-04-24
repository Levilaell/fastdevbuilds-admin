import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { getCountry } from '@/lib/bot-config'
import { getInstances } from '@/lib/whatsapp'

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

  // Look up campaign config to send niches + cities as source of truth
  const countryConfig = getCountry(market)
  // Prefer chips that match the campaign's country — keeps BR chip off US
  // numbers and vice versa (cross-country sends risk WhatsApp Business bans).
  // If no chip of the target country exists, fall back to all chips so the
  // dashboard can still run (user has been warned in the UI and takes the
  // trust / ban risk consciously).
  let instances: ReturnType<typeof getInstances> = []
  if (countryConfig?.channel === 'whatsapp') {
    instances = getInstances({ country: countryConfig.country })
    if (instances.length === 0) {
      instances = getInstances()
      if (instances.length > 0) {
        console.warn(
          `[queue] no chips for country=${countryConfig.country} — cross-country fallback to ${instances.length} chip(s)`,
        )
      }
    }
  }

  try {
    // Fetch bot queue and instance send counts in parallel
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const supabase = createServiceClient()

    const [botRes, sendsRes] = await Promise.all([
      fetch(`${botUrl}/api/bot/queue`, {
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
          country: countryConfig?.country,
          channel: countryConfig?.channel,
          evolutionInstances: instances.map(i => ({
            name: i.name,
            apiKey: i.apiKey,
            country: i.country,
          })),
          evolutionApiUrl: process.env.EVOLUTION_API_URL,
        }),
      }),
      supabase
        .from('leads')
        .select('evolution_instance')
        .not('evolution_instance', 'is', null)
        .not('outreach_sent_at', 'is', null)
        .gte('outreach_sent_at', since),
    ])

    if (!botRes.ok) {
      return Response.json(
        { error: `Bot server retornou ${botRes.status}` },
        { status: botRes.status },
      )
    }

    // Count sends per instance in the last 24h
    const countMap = new Map<string, number>()
    for (const inst of instances) countMap.set(inst.name, 0)
    for (const row of sendsRes.data ?? []) {
      const name = row.evolution_instance as string
      if (countMap.has(name)) countMap.set(name, (countMap.get(name) ?? 0) + 1)
    }

    const instanceCounts = instances.map(i => ({
      name: i.name,
      sent24h: countMap.get(i.name) ?? 0,
    }))
    const totalSent = instanceCounts.reduce((sum, i) => sum + i.sent24h, 0)

    const data = await botRes.json()

    // Enrich stats with instance send counts
    if (data.stats) {
      data.stats.whatsappSentToday = totalSent
      data.stats.instanceCounts = instanceCounts
    }

    return Response.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro de conexão'
    return Response.json({ error: message }, { status: 502 })
  }
}
