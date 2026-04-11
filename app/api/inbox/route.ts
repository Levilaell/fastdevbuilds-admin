import { NextRequest } from 'next/server'
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
    inbox_archived_at: string | null
  } | null
}

export async function GET(request: NextRequest) {
  const showArchived = request.nextUrl.searchParams.get('archived') === 'true'

  const supabase = await createClient()

  // Get all conversations joined with leads, ordered by newest first
  const { data, error } = await supabase
    .from('conversations')
    .select('place_id, direction, message, sent_at, read_at, leads(business_name, outreach_channel, status, inbox_archived_at)')
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
    last_direction: string | null
    unread_count: number
    archived: boolean
    waiting_since: string | null
  }>()

  for (const row of rows) {
    const isArchived = !!row.leads?.inbox_archived_at
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
        last_direction: row.direction,
        unread_count: isUnread ? 1 : 0,
        archived: isArchived,
        // If the latest message is outbound, track when we sent it (waiting for reply)
        waiting_since: row.direction === 'out' ? row.sent_at : null,
      })
    } else {
      if (isUnread) existing.unread_count++
    }
  }

  // Filter by archived state
  const items = Array.from(map.values())
    .filter((item) => showArchived ? item.archived : !item.archived)
    .sort((a, b) => {
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
      return tb - ta
    })

  return Response.json(items)
}
