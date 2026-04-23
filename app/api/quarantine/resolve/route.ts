import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { onInboundLeadMessage } from '@/lib/leads/on-inbound'
import { isAutoReply } from '@/lib/auto-reply'

interface Body {
  quarantine_id?: unknown
  place_id?: unknown
}

/**
 * Manually attribute a quarantined @lid inbound to a real lead.
 *
 * Steps (not atomic — ordered so a mid-flight failure leaves the system in a
 * recoverable state):
 *  1. Insert the message into `conversations` (dedup via provider_message_id
 *     unique index if a late-arriving webhook raced us).
 *  2. If the remote_jid is @lid, persist it on `lead.whatsapp_lid_jid` so
 *     future messages from the same contact short-circuit to match #1
 *     (jid-exact) with zero manual work.
 *  3. Transition lead status (sent → replied) via `onInboundLeadMessage`.
 *  4. Mark the quarantine row resolved.
 *
 * Idempotent: re-running with the same inputs is a no-op after the first
 * success (conversations dedup on provider_message_id; quarantine resolved
 * flag prevents re-entry).
 */
export async function POST(request: Request) {
  if (!(await getAuthUser())) return unauthorizedResponse()

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const quarantineId =
    typeof body.quarantine_id === 'string' ? body.quarantine_id.trim() : ''
  const placeId =
    typeof body.place_id === 'string' ? body.place_id.trim() : ''

  if (!quarantineId || !placeId) {
    return Response.json(
      { error: 'missing_fields', required: ['quarantine_id', 'place_id'] },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()

  const { data: qRow, error: qErr } = await supabase
    .from('webhook_inbound_quarantine')
    .select(
      'id, received_at, provider_message_id, remote_jid, push_name, message_text, evolution_instance, from_me, resolved, raw_payload',
    )
    .eq('id', quarantineId)
    .maybeSingle()

  if (qErr) {
    return Response.json({ error: qErr.message }, { status: 500 })
  }
  if (!qRow) {
    return Response.json({ error: 'quarantine_not_found' }, { status: 404 })
  }
  if (qRow.resolved) {
    return Response.json({ error: 'already_resolved' }, { status: 409 })
  }
  if (qRow.from_me) {
    return Response.json(
      { error: 'cannot_attribute_outbound' },
      { status: 400 },
    )
  }

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('place_id, status, status_updated_at, whatsapp_lid_jid, whatsapp_jid')
    .eq('place_id', placeId)
    .maybeSingle()

  if (leadErr) {
    return Response.json({ error: leadErr.message }, { status: 500 })
  }
  if (!lead) {
    return Response.json({ error: 'lead_not_found' }, { status: 404 })
  }

  const payload = qRow.raw_payload as
    | { data?: { messageTimestamp?: unknown } }
    | null
  const ts = payload?.data?.messageTimestamp
  let sentAt = qRow.received_at as string
  if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
    sentAt = new Date(ts * 1000).toISOString()
  } else if (typeof ts === 'string' && /^\d+$/.test(ts.trim())) {
    const n = Number(ts.trim())
    if (Number.isFinite(n) && n > 0) sentAt = new Date(n * 1000).toISOString()
  }

  // Auto-reply content classification: if the text matches institutional
  // auto-greeters (horário de atendimento, bem-vindo ao consultório, etc.),
  // insert the conversation with `approved_by='auto-reply'` and skip the
  // lead-state transition below. This prevents attributing a backlog of
  // obvious auto-replies from spuriously moving leads `sent → replied`, which
  // would corrupt pipeline metrics (same concern commit 9b7f5f1 addressed on
  // the live webhook path).
  const messageText = qRow.message_text ?? ''
  const classifiedAsAutoReply = isAutoReply(messageText)

  // 1. Insert conversation — tolerate UNIQUE violation (late-arriving webhook
  // already inserted the same row) by continuing through the remaining steps.
  const { error: insertErr } = await supabase.from('conversations').insert({
    place_id: placeId,
    direction: 'in',
    channel: 'whatsapp',
    message: messageText,
    sent_at: sentAt,
    suggested_by_ai: false,
    approved_by: classifiedAsAutoReply ? 'auto-reply' : null,
    provider_message_id: qRow.provider_message_id ?? null,
  })

  if (insertErr && insertErr.code !== '23505') {
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  // 2. Learn the @lid alias if we don't have one yet. The canonical
  // `whatsapp_jid` (from dispatch's lookupJidFromPhone) is left untouched.
  const remoteJid = qRow.remote_jid as string
  const isLid = typeof remoteJid === 'string' && remoteJid.endsWith('@lid')
  if (isLid && !lead.whatsapp_lid_jid) {
    const { error: updErr } = await supabase
      .from('leads')
      .update({ whatsapp_lid_jid: remoteJid })
      .eq('place_id', placeId)
    if (updErr) {
      console.error(
        '[quarantine:resolve] lid_jid update failed — place_id:',
        placeId,
        'lid:',
        remoteJid,
        'err:',
        updErr.message,
      )
    }
  }

  // 3. Lead-state transition — only for real human replies. Auto-replies just
  // get archived in conversations; no `sent → replied` transition, no
  // `last_human_reply_at` update, so the pipeline stays clean.
  //
  // Defensive on the auto-reply branch: pin `status` + `status_updated_at`
  // back to their pre-insert values in the same UPDATE that sets
  // last_auto_reply_at. This clobbers any side-effect (e.g. a stray DB
  // trigger observed in production that moved leads `sent → replied` when
  // an inbound conversation was inserted, regardless of approved_by). Cheap
  // insurance that makes this endpoint authoritative.
  if (!classifiedAsAutoReply) {
    await onInboundLeadMessage(supabase, placeId, sentAt, lead.status)
  } else {
    await supabase
      .from('leads')
      .update({
        last_auto_reply_at: sentAt,
        status: lead.status,
        status_updated_at: lead.status_updated_at,
      })
      .eq('place_id', placeId)
  }

  // 4. Mark resolved last — only now is the attribution committed everywhere.
  const { error: resolveErr } = await supabase
    .from('webhook_inbound_quarantine')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_to_place_id: placeId,
    })
    .eq('id', quarantineId)
    .eq('resolved', false)

  if (resolveErr) {
    return Response.json({ error: resolveErr.message }, { status: 500 })
  }

  return Response.json({ ok: true, place_id: placeId })
}
