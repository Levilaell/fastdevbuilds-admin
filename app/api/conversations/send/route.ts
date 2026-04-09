import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // If channel is whatsapp and Evolution API is configured, send via Evolution
  if (channel === 'whatsapp' && process.env.EVOLUTION_API_URL) {
    const leadRes = await supabase
      .from('leads')
      .select('phone')
      .eq('place_id', place_id)
      .single()

    if (leadRes.data?.phone) {
      const phone = leadRes.data.phone.replace(/\D/g, '')
      try {
        const evoRes = await fetch(
          `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: process.env.EVOLUTION_API_KEY ?? '',
            },
            body: JSON.stringify({
              number: phone,
              textMessage: { text: message },
            }),
          }
        )
        console.log('[send] Evolution API response status:', evoRes.status)
        const evoBody = await evoRes.text()
        console.log('[send] Evolution API response body:', evoBody.slice(0, 200))
      } catch (err) {
        console.error('[send] Evolution API error:', err instanceof Error ? err.message : err)
      }
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
