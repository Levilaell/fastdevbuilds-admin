import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { sendWhatsApp } from '@/lib/whatsapp'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { id } = await params
  const body = await request.json()
  const editedReply: string | undefined = body.edited_reply

  const supabase = createServiceClient()

  // Fetch the suggestion
  const { data: suggestion, error } = await supabase
    .from('ai_suggestions')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !suggestion) {
    return Response.json({ error: 'Suggestion not found' }, { status: 404 })
  }

  const message = editedReply ?? suggestion.suggested_reply

  // Fetch lead phone
  const { data: lead } = await supabase
    .from('leads')
    .select('phone')
    .eq('place_id', suggestion.place_id)
    .single()

  if (!lead?.phone) {
    return Response.json({ error: 'Lead não tem telefone cadastrado' }, { status: 400 })
  }

  // Send via WhatsApp
  const sent = await sendWhatsApp(lead.phone, message)
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

  // Mark suggestion as sent
  await supabase
    .from('ai_suggestions')
    .update({
      status: 'sent',
      suggested_reply: message,
      approved_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
    })
    .eq('id', id)

  // Dismiss any other pending suggestions for this lead
  await supabase
    .from('ai_suggestions')
    .update({ status: 'rejected' })
    .eq('place_id', suggestion.place_id)
    .eq('status', 'pending')

  return Response.json({ ok: true, conversation: conv })
}
