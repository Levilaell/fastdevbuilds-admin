import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { sendWhatsApp, getOrAssignInstance } from '@/lib/whatsapp'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { id } = await params
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })
  const body = await request.json()
  const editedReply: string | undefined = body.edited_reply

  const supabase = createServiceClient()

  // Fetch the suggestion
  const { data: suggestion, error } = await supabase
    .from('ai_suggestions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!suggestion) {
    return Response.json({ error: 'Suggestion not found' }, { status: 404 })
  }

  const message = editedReply ?? suggestion.suggested_reply

  // Fetch lead phone
  const { data: lead } = await supabase
    .from('leads')
    .select('phone')
    .eq('place_id', suggestion.place_id)
    .maybeSingle()

  if (!lead?.phone) {
    return Response.json({ error: 'Lead não tem telefone cadastrado' }, { status: 400 })
  }

  // Send via WhatsApp — use lead's assigned instance
  const instance = await getOrAssignInstance(supabase, suggestion.place_id)
  const sent = await sendWhatsApp(lead.phone, message, instance?.name)
  if (!sent) {
    return Response.json({ error: 'Falha ao enviar WhatsApp' }, { status: 502 })
  }

  // Save outbound conversation
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({
      place_id: suggestion.place_id,
      direction: 'out',
      channel: 'whatsapp',
      message,
      sent_at: new Date().toISOString(),
      suggested_by_ai: true,
    })
    .select()
    .single()

  if (convError) {
    console.error('[ai-approve] failed to save conversation:', convError.message)
    return Response.json({ error: 'Mensagem enviada mas falha ao salvar conversa' }, { status: 500 })
  }

  // Mark suggestion as sent + dismiss other pending suggestions atomically
  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('ai_suggestions')
    .update({
      status: 'sent',
      suggested_reply: message,
      approved_at: now,
      sent_at: now,
    })
    .eq('id', id)
    .eq('status', 'pending') // only update if still pending (prevents double-approve race)

  if (updateError) {
    console.error('[ai-approve] failed to mark suggestion as sent:', updateError.message)
  }

  // Dismiss any other pending suggestions for this lead
  await supabase
    .from('ai_suggestions')
    .update({ status: 'rejected' })
    .eq('place_id', suggestion.place_id)
    .eq('status', 'pending')
    .neq('id', id) // exclude the one we just approved

  return Response.json({ ok: true, conversation: conv })
}
