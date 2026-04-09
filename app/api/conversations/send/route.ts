import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
      { status: 400 }
    )
  }

  const supabase = await createClient()

  // If channel is whatsapp, send via Evolution API (normalizes phone with country code)
  if (channel === 'whatsapp') {
    const leadRes = await supabase
      .from('leads')
      .select('phone')
      .eq('place_id', place_id)
      .single()

    if (leadRes.data?.phone) {
      const sent = await sendWhatsApp(leadRes.data.phone, message)
      console.log('[send] WhatsApp sent:', sent, 'to', leadRes.data.phone)
    }
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
  const leadCheck = await supabase
    .from('leads')
    .select('status')
    .eq('place_id', place_id)
    .single()

  if (leadCheck.data?.status === 'replied') {
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
