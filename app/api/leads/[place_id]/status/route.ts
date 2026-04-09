import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { LEAD_STATUSES, type LeadStatus, type Lead, type Conversation } from '@/lib/types'
import { getRecentConversations } from '@/lib/supabase/queries'
import { generateProposal } from '@/lib/ai-workflow'

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

  const supabase = createServiceClient()

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
