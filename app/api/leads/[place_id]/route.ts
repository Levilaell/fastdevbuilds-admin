import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ place_id: string }> }
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('place_id', place_id)
    .maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return Response.json({ error: 'Lead not found' }, { status: 404 })
  }

  return Response.json(data)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ place_id: string }> }
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })
  const body = await request.json()
  const supabase = createServiceClient()

  // Only allow updating specific fields
  const allowed: Record<string, unknown> = {}
  if (typeof body.phone === 'string') allowed.phone = body.phone
  if (typeof body.business_name === 'string') allowed.business_name = body.business_name
  if (typeof body.email === 'string') allowed.email = body.email

  if (Object.keys(allowed).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('leads')
    .update(allowed)
    .eq('place_id', place_id)
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}
