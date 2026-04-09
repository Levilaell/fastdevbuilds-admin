import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsApp } from '@/lib/whatsapp'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  const { place_id } = await params
  const body = await request.json()
  const editedMessage: string | undefined = body.message
  const editedPrice: number | undefined = body.price

  const supabase = await createClient()

  // Fetch project
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('place_id', place_id)
    .single()

  if (error || !project) {
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
    .single()

  // Send via WhatsApp
  if (lead?.phone) {
    await sendWhatsApp(lead.phone, message)
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

  // Update project
  const updates: Record<string, unknown> = {
    status: 'approved',
    proposal_message: message,
    updated_at: new Date().toISOString(),
  }
  if (editedPrice !== undefined) updates.price = editedPrice
  await supabase.from('projects').update(updates).eq('place_id', place_id)

  return Response.json({ ok: true })
}
