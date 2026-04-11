import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { LeadStatus } from '@/lib/types'

interface RawRow {
  place_id: string
  direction: string
  message: string
  sent_at: string
  read_at: string | null
}

interface LeadInfo {
  place_id: string
  business_name: string | null
  outreach_channel: string | null
  status: LeadStatus
  inbox_archived_at: string | null
}

export async function GET(request: NextRequest) {
  const showArchived = request.nextUrl.searchParams.get('archived') === 'true'
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 50, 200)
  const offset = Math.max(Number(request.nextUrl.searchParams.get('offset')) || 0, 0)

  const supabase = await createClient()

  // Step 1: Fetch leads that have conversations (filtered by archive state)
  const leadsQuery = supabase
    .from('leads')
    .select('place_id, business_name, outreach_channel, status, inbox_archived_at')

  if (showArchived) {
    leadsQuery.not('inbox_archived_at', 'is', null)
  } else {
    leadsQuery.is('inbox_archived_at', null)
  }

  const { data: leadsData, error: leadsError } = await leadsQuery

  if (leadsError) {
    return Response.json({ error: leadsError.message }, { status: 500 })
  }

  const leads = (leadsData ?? []) as LeadInfo[]
  if (leads.length === 0) {
    return Response.json([])
  }

  const placeIds = leads.map(l => l.place_id)
  const leadMap = new Map(leads.map(l => [l.place_id, l]))

  // Step 2: Fetch only the latest conversation per lead + unread counts
  // We fetch conversations only for the leads we care about
  const { data: convData, error: convError } = await supabase
    .from('conversations')
    .select('place_id, direction, message, sent_at, read_at')
    .in('place_id', placeIds)
    .order('sent_at', { ascending: false })

  if (convError) {
    return Response.json({ error: convError.message }, { status: 500 })
  }

  const rows = (convData ?? []) as RawRow[]

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
    const lead = leadMap.get(row.place_id)
    if (!lead) continue

    const existing = map.get(row.place_id)
    const isUnread = row.direction === 'in' && !row.read_at

    if (!existing) {
      map.set(row.place_id, {
        place_id: row.place_id,
        business_name: lead.business_name,
        outreach_channel: lead.outreach_channel,
        status: lead.status,
        last_message: row.message,
        last_message_at: row.sent_at,
        last_direction: row.direction,
        unread_count: isUnread ? 1 : 0,
        archived: !!lead.inbox_archived_at,
        waiting_since: row.direction === 'out' ? row.sent_at : null,
      })
    } else {
      if (isUnread) existing.unread_count++
    }
  }

  const allItems = Array.from(map.values())
    .sort((a, b) => {
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
      return tb - ta
    })

  const items = allItems.slice(offset, offset + limit)

  return Response.json(items, {
    headers: {
      'X-Total-Count': String(allItems.length),
    },
  })
}
