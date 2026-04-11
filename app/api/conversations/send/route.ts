import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { sendWhatsApp } from '@/lib/whatsapp'

export async function POST(request: NextRequest) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const body = await request.json()
  const { place_id, message, channel } = body as {
    place_id: string
    message: string
    channel: 'whatsapp' | 'email'
  }

  if (!place_id || !message || !channel) {
    return Response.json(
      { error: 'place_id, message, and channel are required' },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()

  // Fetch lead for phone/email check
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('phone, email')
    .eq('place_id', place_id)
    .maybeSingle()

  if (leadError) {
    return Response.json({ error: leadError.message }, { status: 500 })
  }

  if (!lead) {
    return Response.json({ error: 'Lead não encontrado' }, { status: 404 })
  }

  // Send via WhatsApp
  if (channel === 'whatsapp') {
    const phone = lead.phone?.trim()
    if (!phone) {
      return Response.json({ error: 'Lead não tem telefone cadastrado' }, { status: 400 })
    }
    const sent = await sendWhatsApp(phone, message)
    if (!sent) {
      return Response.json({ error: 'Falha ao enviar WhatsApp' }, { status: 502 })
    }
  }

  // Email not implemented — block if attempted
  if (channel === 'email') {
    if (!lead.email?.trim()) {
      return Response.json({ error: 'Lead não tem email cadastrado' }, { status: 400 })
    }
    return Response.json({ error: 'Envio de email ainda não implementado' }, { status: 501 })
  }

  // Save conversation
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({
      place_id,
      direction: 'out',
      channel,
      message,
      sent_at: new Date().toISOString(),
      suggested_by_ai: false,
    })
    .select()
    .single()

  if (convError) {
    return Response.json({ error: convError.message }, { status: 500 })
  }

  // Dismiss any pending AI suggestions — user replied manually
  await supabase
    .from('ai_suggestions')
    .update({ status: 'rejected' })
    .eq('place_id', place_id)
    .eq('status', 'pending')

  // Auto-advance status based on current state
  const { data: leadCheck } = await supabase
    .from('leads')
    .select('status')
    .eq('place_id', place_id)
    .maybeSingle()

  if (leadCheck?.status === 'prospected') {
    // First manual message → mark as sent
    await supabase
      .from('leads')
      .update({
        status: 'sent',
        outreach_sent: true,
        outreach_sent_at: new Date().toISOString(),
        outreach_channel: channel,
        status_updated_at: new Date().toISOString(),
      })
      .eq('place_id', place_id)
  } else if (leadCheck?.status === 'replied') {
    // Reply to lead → negotiating
    await supabase
      .from('leads')
      .update({
        status: 'negotiating',
        status_updated_at: new Date().toISOString(),
      })
      .eq('place_id', place_id)
  }

  return Response.json(conv)
}
