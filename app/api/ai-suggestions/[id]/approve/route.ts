import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsApp } from '@/lib/whatsapp'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json()
  const editedReply: string | undefined = body.edited_reply

  const supabase = await createClient()

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

  // Send via WhatsApp
  if (lead?.phone) {
    await sendWhatsApp(lead.phone, message)
  }

  // Save outbound conversation
  const { data: conv } = await supabase
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

  return Response.json({ ok: true, conversation: conv })
}
