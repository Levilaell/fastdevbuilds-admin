import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendWhatsApp } from '@/lib/whatsapp'

export async function POST(request: NextRequest) {
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
  const { data: lead } = await supabase
    .from('leads')
    .select('phone, email')
    .eq('place_id', place_id)
    .single()

  // Send via WhatsApp
  if (channel === 'whatsapp') {
    if (!lead?.phone) {
      return Response.json({ error: 'Lead não tem telefone cadastrado' }, { status: 400 })
    }
    const sent = await sendWhatsApp(lead.phone, message)
    if (!sent) {
      return Response.json({ error: 'Falha ao enviar WhatsApp' }, { status: 502 })
    }
  }

  // Email not implemented — block if attempted
  if (channel === 'email') {
    if (!lead?.email) {
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

  // Auto-advance status: replied → negotiating
  const { data: leadCheck } = await supabase
    .from('leads')
    .select('status')
    .eq('place_id', place_id)
    .single()

  if (leadCheck?.status === 'replied') {
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
