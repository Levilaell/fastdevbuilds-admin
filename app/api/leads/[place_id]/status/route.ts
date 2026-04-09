import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { LEAD_STATUSES, type LeadStatus } from '@/lib/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> }
) {
  const { place_id } = await params
  const body = await request.json()
  const newStatus = body.status as string

  if (!LEAD_STATUSES.includes(newStatus as LeadStatus)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('leads')
    .update({
      status: newStatus,
      status_updated_at: new Date().toISOString(),
    })
    .eq('place_id', place_id)
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}
