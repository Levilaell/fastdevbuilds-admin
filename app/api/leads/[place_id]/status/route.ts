import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { LEAD_STATUSES, type LeadStatus } from '@/lib/types'

/**
 * Allowed transitions between lead statuses. Reversibility is deliberate:
 * the user is the source of truth for their funnel, and common corrections
 * (e.g. spotting an auto-reply mislabeled as a real reply → move back to
 * `sent`) need to happen without a UI workaround. Only `disqualified` is
 * one-way, because it's set by the bot's qualification pass and shouldn't
 * be reused to re-queue a lead.
 */
const ACTIVE_STATUSES: LeadStatus[] = ['prospected', 'sent', 'replied', 'negotiating', 'closed']
const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  prospected: [...ACTIVE_STATUSES, 'lost', 'disqualified'],
  sent: [...ACTIVE_STATUSES, 'lost', 'disqualified'],
  replied: [...ACTIVE_STATUSES, 'lost', 'disqualified'],
  negotiating: [...ACTIVE_STATUSES, 'lost', 'disqualified'],
  closed: [...ACTIVE_STATUSES, 'lost', 'disqualified'],
  lost: [...ACTIVE_STATUSES],
  disqualified: [],
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

  return Response.json(data)
}
