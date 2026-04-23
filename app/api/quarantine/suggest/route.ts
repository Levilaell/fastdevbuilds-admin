import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { matchLeadByPushName } from '@/lib/leads/pushname-match'

/**
 * Produce high-confidence attribution suggestions for the backlog of
 * unresolved quarantine entries, so the user can bulk-apply instead of
 * triaging 20+ rows by hand. Two strategies, in order:
 *
 *   1. pushname — `push_name` strong-matches (substring/subset) a lead's
 *      `business_name` on the same instance, disambiguated from runners-up.
 *      Same logic as the real-time webhook's match #5, so anything the live
 *      matcher would have caught on the next message is applied immediately
 *      to its backlog.
 *
 *   2. timing — exactly one outbound on the same instance within the
 *      TIMING_WINDOW_MS before the orphan, OR multiple but a clear winner
 *      (closest candidate ≥ 2× closer than runner-up). This is the stricter
 *      variant of match #4: only applied when confidence is high.
 *
 * Anything ambiguous is deliberately *not* suggested — the user triages
 * those manually. False-positive attribution is more costly than manual
 * work (permanently binds an @lid to the wrong lead).
 */

const TIMING_WINDOW_MS = 10 * 60 * 1000
const TIMING_RUNNER_UP_RATIO = 2

interface OrphanRow {
  id: string
  received_at: string
  remote_jid: string
  push_name: string | null
  message_text: string | null
  evolution_instance: string | null
  raw_payload: { data?: { messageTimestamp?: unknown } } | null
}

interface LeadRow {
  place_id: string
  business_name: string | null
  status: string
  outreach_sent_at: string | null
  evolution_instance: string | null
}

interface Suggestion {
  quarantine_id: string
  place_id: string
  business_name: string | null
  reason: 'pushname' | 'timing'
  note: string
  orphan: {
    push_name: string | null
    message_text: string | null
    message_sent_at: string
    remote_jid: string
    evolution_instance: string | null
  }
}

function orphanTimestamp(row: OrphanRow): string {
  const ts = row.raw_payload?.data?.messageTimestamp
  if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
    return new Date(ts * 1000).toISOString()
  }
  if (typeof ts === 'string' && /^\d+$/.test(ts.trim())) {
    const n = Number(ts.trim())
    if (Number.isFinite(n) && n > 0) return new Date(n * 1000).toISOString()
  }
  return row.received_at
}

export async function GET() {
  if (!(await getAuthUser())) return unauthorizedResponse()

  const supabase = createServiceClient()

  const { data: orphans, error: oErr } = await supabase
    .from('webhook_inbound_quarantine')
    .select(
      'id, received_at, remote_jid, push_name, message_text, evolution_instance, raw_payload',
    )
    .eq('resolved', false)
    .eq('from_me', false)
    .order('received_at', { ascending: false })
    .limit(500)

  if (oErr) return Response.json({ error: oErr.message }, { status: 500 })
  if (!orphans || orphans.length === 0) return Response.json([])

  // Group timing-candidates by instance so we only query leads once per
  // instance rather than N times per orphan.
  const instancesTouched = new Set<string>()
  for (const o of orphans as OrphanRow[]) {
    if (o.evolution_instance) instancesTouched.add(o.evolution_instance)
  }

  const leadsByInstance = new Map<string, LeadRow[]>()
  for (const instance of instancesTouched) {
    const since = new Date(
      Date.now() - (TIMING_WINDOW_MS + 24 * 60 * 60 * 1000),
    ).toISOString()
    const { data: leads } = await supabase
      .from('leads')
      .select(
        'place_id, business_name, status, outreach_sent_at, evolution_instance',
      )
      .eq('evolution_instance', instance)
      .eq('outreach_sent', true)
      .gte('outreach_sent_at', since)

    leadsByInstance.set(instance, (leads ?? []) as LeadRow[])
  }

  const suggestions: Suggestion[] = []
  const claimedPlaceIds = new Set<string>()

  for (const row of orphans as OrphanRow[]) {
    const instance = row.evolution_instance ?? ''
    if (!instance) continue

    const msgSentAt = orphanTimestamp(row)
    const baseOrphan = {
      push_name: row.push_name,
      message_text: row.message_text,
      message_sent_at: msgSentAt,
      remote_jid: row.remote_jid,
      evolution_instance: row.evolution_instance,
    }

    // 1. Pushname match — highest confidence, run first.
    if (row.push_name && row.push_name.trim()) {
      const matched = await matchLeadByPushName<LeadRow>({
        supabase,
        pushName: row.push_name,
        instance,
        leadColumns:
          'place_id, business_name, status, outreach_sent_at, evolution_instance',
      })
      if (matched) {
        suggestions.push({
          quarantine_id: row.id,
          place_id: matched.place_id,
          business_name: matched.business_name,
          reason: 'pushname',
          note: `"${row.push_name}" ≈ "${matched.business_name}"`,
          orphan: baseOrphan,
        })
        continue
      }
    }

    // 2. Timing match — only when no pushname match. Strictly require the
    // candidate isn't already claimed by another suggestion in this batch
    // (prevents two orphans from racing onto the same lead when their
    // push_name is null / non-matching).
    const orphanTime = new Date(msgSentAt).getTime()
    const candidates = (leadsByInstance.get(instance) ?? [])
      .filter((l) => {
        if (!l.outreach_sent_at) return false
        if (claimedPlaceIds.has(l.place_id)) return false
        const sentTime = new Date(l.outreach_sent_at).getTime()
        const delta = orphanTime - sentTime
        return delta >= 0 && delta <= TIMING_WINDOW_MS
      })
      .sort((a, b) => {
        // Sort by proximity to the orphan's timestamp — most recent outbound
        // first, because outbounds immediately before an inbound are the
        // most likely trigger for that inbound.
        const ta = new Date(a.outreach_sent_at!).getTime()
        const tb = new Date(b.outreach_sent_at!).getTime()
        return tb - ta
      })

    if (candidates.length === 0) continue

    const [closest, runnerUp] = candidates
    const closestDelta = orphanTime - new Date(closest.outreach_sent_at!).getTime()

    const isClearWinner =
      !runnerUp ||
      orphanTime - new Date(runnerUp.outreach_sent_at!).getTime() >=
        closestDelta * TIMING_RUNNER_UP_RATIO

    if (!isClearWinner) continue

    claimedPlaceIds.add(closest.place_id)
    const closestMin = Math.round(closestDelta / 60000)
    suggestions.push({
      quarantine_id: row.id,
      place_id: closest.place_id,
      business_name: closest.business_name,
      reason: 'timing',
      note: `único outbound em ${closestMin}min`,
      orphan: baseOrphan,
    })
  }

  return Response.json(suggestions)
}
