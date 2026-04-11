import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { sendWhatsApp } from '@/lib/whatsapp'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })
  const body = await request.json()
  const editedMessage: string | undefined = body.message
  const editedPrice: number | undefined = body.price

  const supabase = createServiceClient()

  // Fetch project
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('place_id', place_id)
    .maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }

  const message = editedMessage ?? project.proposal_message
  if (!message) {
    return Response.json({ error: 'No proposal message' }, { status: 400 })
  }

  // Fetch lead phone
  const { data: lead } = await supabase
    .from('leads')
    .select('phone')
    .eq('place_id', place_id)
    .maybeSingle()

  if (!lead?.phone) {
    return Response.json({ error: 'Lead não tem telefone cadastrado' }, { status: 400 })
  }

  // Send via WhatsApp
  const sent = await sendWhatsApp(lead.phone, message)
  if (!sent) {
    return Response.json({ error: 'Falha ao enviar WhatsApp' }, { status: 502 })
  }

  // Save outbound conversation
  await supabase.from('conversations').insert({
    place_id,
    direction: 'out',
    channel: 'whatsapp',
    message,
    sent_at: new Date().toISOString(),
    suggested_by_ai: true,
  })

  // Update project status to approved
  const updates: Record<string, unknown> = {
    status: 'approved',
    proposal_message: message,
  }
  if (editedPrice !== undefined) updates.price = editedPrice
  const { error: updateError } = await supabase
    .from('projects')
    .update(updates)
    .eq('place_id', place_id)

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
