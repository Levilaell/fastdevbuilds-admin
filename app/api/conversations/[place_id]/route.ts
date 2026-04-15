import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ place_id: string }> }
) {
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('place_id', place_id)
    .order('sent_at', { ascending: true })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const conversations = data ?? []

  // Backfill: if the lead has an outreach message but no outbound conversation
  // record exists, inject the initial outreach so the chat shows the sent message.
  // This handles cases where the bot sync or webhook didn't save it.
  const hasOutbound = conversations.some((c: { direction: string }) => c.direction === 'out')
  if (!hasOutbound) {
    const svc = createServiceClient()
    const { data: lead } = await svc
      .from('leads')
      .select('message, outreach_sent, outreach_sent_at, outreach_channel')
      .eq('place_id', place_id)
      .maybeSingle()

    if (lead?.outreach_sent && lead.message) {
      // Insert the missing outreach into the conversations table for persistence
      const { data: inserted } = await svc
        .from('conversations')
        .insert({
          place_id,
          direction: 'out',
          channel: lead.outreach_channel ?? 'whatsapp',
          message: lead.message,
          sent_at: lead.outreach_sent_at ?? new Date().toISOString(),
          suggested_by_ai: false,
        })
        .select('*')
        .single()

      if (inserted) {
        conversations.unshift(inserted)
      }
    }
  }

  return Response.json(conversations)
}
