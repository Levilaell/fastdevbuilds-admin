import { createClient } from '@/lib/supabase/server'
import type { LeadStatus } from '@/lib/types'

interface RawRow {
  place_id: string
  direction: string
  message: string
  sent_at: string
  read_at: string | null
  leads: {
    business_name: string | null
    outreach_channel: string | null
    status: LeadStatus
  } | null
}

export async function GET() {
  const supabase = await createClient()

  // Get all conversations joined with leads, ordered by newest first
  const { data, error } = await supabase
    .from('conversations')
    .select('place_id, direction, message, sent_at, read_at, leads(business_name, outreach_channel, status)')
    .order('sent_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as RawRow[]

  // Group by place_id, keep latest message and count unreads
  const map = new Map<string, {
    place_id: string
    business_name: string | null
    outreach_channel: string | null
    status: LeadStatus
    last_message: string | null
    last_message_at: string | null
    unread_count: number
  }>()

  for (const row of rows) {
    const existing = map.get(row.place_id)
    const isUnread = row.direction === 'in' && !row.read_at

    if (!existing) {
      map.set(row.place_id, {
        place_id: row.place_id,
        business_name: row.leads?.business_name ?? null,
        outreach_channel: row.leads?.outreach_channel ?? null,
        status: row.leads?.status ?? 'prospected',
        last_message: row.message,
        last_message_at: row.sent_at,
        unread_count: isUnread ? 1 : 0,
      })
    } else {
      if (isUnread) existing.unread_count++
    }
  }

  // Sort by last_message_at DESC
  const items = Array.from(map.values()).sort((a, b) => {
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
    return tb - ta
  })

  return Response.json(items)
}
