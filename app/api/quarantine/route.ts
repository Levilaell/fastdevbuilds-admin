import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'

/**
 * Unresolved webhook inbounds that we couldn't attribute to a known lead —
 * typically @lid events where `resolvePhoneFromLid` returned null. Rendered
 * by the "Mensagens órfãs" section of the inbox so the user can manually
 * attribute them to a lead, which also teaches the system the @lid alias
 * for future auto-matching.
 */
export async function GET() {
  if (!(await getAuthUser())) return unauthorizedResponse()

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('webhook_inbound_quarantine')
    .select(
      'id, received_at, remote_jid, push_name, message_text, evolution_instance, reason, raw_payload',
    )
    .eq('resolved', false)
    .eq('from_me', false)
    .order('received_at', { ascending: false })
    .limit(200)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const items = (data ?? []).map((row) => {
    const payload = row.raw_payload as { data?: { messageTimestamp?: unknown } } | null
    const ts = payload?.data?.messageTimestamp
    let messageSentAt: string | null = null
    if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
      messageSentAt = new Date(ts * 1000).toISOString()
    } else if (typeof ts === 'string' && /^\d+$/.test(ts.trim())) {
      const n = Number(ts.trim())
      if (Number.isFinite(n) && n > 0) {
        messageSentAt = new Date(n * 1000).toISOString()
      }
    }

    return {
      id: row.id,
      received_at: row.received_at,
      message_sent_at: messageSentAt ?? row.received_at,
      remote_jid: row.remote_jid,
      push_name: row.push_name,
      message_text: row.message_text,
      evolution_instance: row.evolution_instance,
      reason: row.reason,
    }
  })

  return Response.json(items)
}
