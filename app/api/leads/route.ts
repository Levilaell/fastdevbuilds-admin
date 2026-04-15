import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const CARD_COLUMNS = 'place_id, business_name, city, pain_score, outreach_channel, evolution_instance, status, status_updated_at, niche'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = request.nextUrl

  const status = searchParams.get('status')
  const channel = searchParams.get('channel')
  const minScore = searchParams.get('min_score')
  const niche = searchParams.get('niche')
  const search = searchParams.get('search')

  let query = supabase
    .from('leads')
    .select(CARD_COLUMNS)
    .order('status_updated_at', { ascending: false, nullsFirst: false })

  if (status) query = query.eq('status', status)
  if (channel) query = query.eq('outreach_channel', channel)
  if (minScore) query = query.gte('pain_score', Number(minScore))
  if (niche) query = query.eq('niche', niche)
  if (search) query = query.ilike('business_name', `%${search}%`)

  const { data, error } = await query

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}
