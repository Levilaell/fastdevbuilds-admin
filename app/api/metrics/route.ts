import { fetchMetrics } from '@/lib/metrics'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') ?? 'all'
  // Optional campaign filter (e.g., 'BR-WA-PREVIEW'). Empty string or
  // 'all' both mean unfiltered — kept tolerant so the UI can pass either.
  const campaignParam = searchParams.get('campaign')
  const campaign =
    campaignParam && campaignParam !== 'all' && campaignParam !== ''
      ? campaignParam
      : null

  try {
    const data = await fetchMetrics(period, campaign)
    return Response.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    return Response.json({ error: message }, { status: 500 })
  }
}
