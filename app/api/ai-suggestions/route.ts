import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { AiSuggestion } from '@/lib/types'

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get('place_id')
  if (!placeId) {
    return Response.json({ error: 'place_id is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('ai_suggestions')
    .select('*')
    .eq('place_id', placeId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json((data as AiSuggestion | null) ?? null)
}
