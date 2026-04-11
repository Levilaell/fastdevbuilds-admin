import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { LEAD_STATUSES, type LeadStatus, type Lead, type Conversation } from '@/lib/types'
import { getRecentConversations } from '@/lib/supabase/queries'
import { generateProposal } from '@/lib/ai-workflow'

/** Allowed forward transitions — any status can also move to 'lost'. */
const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  prospected: ['sent', 'lost'],
  sent: ['replied', 'lost'],
  replied: ['negotiating', 'scoped', 'lost'],
  negotiating: ['scoped', 'lost'],
  scoped: ['closed', 'lost'],
  closed: ['finalizado', 'lost'],
  finalizado: ['pago', 'lost'],
  pago: ['lost'],
  lost: ['prospected', 'sent', 'replied', 'negotiating'],
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> }
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })
  const body = await request.json()
  const newStatus = body.status as string

  if (!LEAD_STATUSES.includes(newStatus as LeadStatus)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Validate transition
  const { data: current, error: currentError } = await supabase
    .from('leads')
    .select('status')
    .eq('place_id', place_id)
    .maybeSingle()

  if (currentError) {
    return Response.json({ error: currentError.message }, { status: 500 })
  }

  if (!current) {
    return Response.json({ error: 'Lead not found' }, { status: 404 })
  }

  if (current) {
    const currentStatus = current.status as LeadStatus
    const allowed = ALLOWED_TRANSITIONS[currentStatus]
    if (allowed && !allowed.includes(newStatus as LeadStatus)) {
      return Response.json(
        { error: `Transição inválida: ${currentStatus} → ${newStatus}` },
        { status: 400 },
      )
    }
  }

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

  // Fire and forget: generate proposal when moving to 'scoped'
  if (newStatus === 'scoped') {
    const conversations = await getRecentConversations(supabase, place_id, 10)
    generateProposal(data as Lead, conversations as Conversation[]).catch(console.error)
  }

  return Response.json(data)
}
