import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
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
  evolution_instance: string | null
}

export async function GET(request: NextRequest) {
  if (!(await getAuthUser())) return unauthorizedResponse()

  const showArchived = request.nextUrl.searchParams.get('archived') === 'true'
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 200, 200)
  const offset = Math.max(Number(request.nextUrl.searchParams.get('offset')) || 0, 0)

  const supabase = createServiceClient()

  // Step 1: Fetch ALL conversations with explicit range to avoid Supabase
  // default ~1000 row limit that silently truncates results.
  // Query conversations FIRST, then fetch lead info only for leads that
  // actually have conversations. This avoids a massive .in() filter on the
  // conversations table which can exceed PostgREST URL length limits.
  const { data: convData, error: convError } = await supabase
    .from('conversations')
    .select('place_id, direction, message, sent_at, read_at')
    .order('sent_at', { ascending: false })
    .range(0, 9999)

  if (convError) {
    return Response.json({ error: convError.message }, { status: 500 })
  }

  const rows = (convData ?? []) as RawRow[]

  // Step 2: Group by place_id — keep latest message and count unreads
  const convMap = new Map<string, {
    last_message: string
    last_message_at: string
    last_direction: string
    unread_count: number
    waiting_since: string | null
  }>()

  for (const row of rows) {
    const existing = convMap.get(row.place_id)
    const isUnread = row.direction === 'in' && !row.read_at

    if (!existing) {
      convMap.set(row.place_id, {
        last_message: row.message,
        last_message_at: row.sent_at,
        last_direction: row.direction,
        unread_count: isUnread ? 1 : 0,
        waiting_since: row.direction === 'out' ? row.sent_at : null,
      })
    } else {
      if (isUnread) existing.unread_count++
    }
  }

  const placeIdsWithConvs = [...convMap.keys()]
  if (placeIdsWithConvs.length === 0) {
    return Response.json([])
  }

  // Step 3: Fetch lead info only for leads that have conversations.
  // Chunk the .in() to stay within PostgREST URL length limits.
  const CHUNK_SIZE = 200
  const leadMap = new Map<string, LeadInfo>()

  for (let i = 0; i < placeIdsWithConvs.length; i += CHUNK_SIZE) {
    const chunk = placeIdsWithConvs.slice(i, i + CHUNK_SIZE)
    const query = supabase
      .from('leads')
      .select('place_id, business_name, outreach_channel, status, inbox_archived_at, evolution_instance')
      .in('place_id', chunk)
      .not('status', 'in', '("disqualified","lost")')

    if (showArchived) {
      query.not('inbox_archived_at', 'is', null)
    } else {
      query.is('inbox_archived_at', null)
    }

    const { data, error } = await query
    if (error) return Response.json({ error: error.message }, { status: 500 })
    for (const lead of (data ?? []) as LeadInfo[]) {
      leadMap.set(lead.place_id, lead)
    }
  }

  // Step 4: Merge conversations with lead info
  const allItems = placeIdsWithConvs
    .filter(pid => leadMap.has(pid))
    .map(pid => {
      const lead = leadMap.get(pid)!
      const conv = convMap.get(pid)!
      return {
        place_id: pid,
        business_name: lead.business_name,
        outreach_channel: lead.outreach_channel,
        evolution_instance: lead.evolution_instance,
        status: lead.status,
        last_message: conv.last_message,
        last_message_at: conv.last_message_at,
        last_direction: conv.last_direction,
        unread_count: conv.unread_count,
        archived: !!lead.inbox_archived_at,
        waiting_since: conv.waiting_since,
      }
    })
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
