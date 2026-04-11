import { createClient } from '@supabase/supabase-js'
import { getRecentConversations } from '@/lib/supabase/queries'
import { classifyAndSuggest } from '@/lib/ai-workflow'
import { isAutoReply, isInstantReply } from '@/lib/auto-reply'
import { logWebhook } from './debug/route'
import type { Lead } from '@/lib/types'

/** Normalize a Brazilian phone to 55 + DDD + number (12-13 digits). */
function normalize(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  // Already has country code and valid length
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) return digits
  // Domestic format: 10-11 digits (DDD + number)
  const clean = digits.startsWith('0') ? digits.slice(1) : digits
  if (clean.length >= 10 && clean.length <= 11) return `55${clean}`
  // Unknown format — return as-is (don't blindly prepend 55 to LID garbage)
  return digits
}

/** Check if a normalized phone looks like a valid BR number. */
function isValidPhone(phone: string): boolean {
  return phone.startsWith('55') && phone.length >= 12 && phone.length <= 13
}

function phoneMatch(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false
  const tail = Math.min(na.length, nb.length, 10)
  return na.slice(-tail) === nb.slice(-tail)
}

/**
 * Resolve a LID (Link ID) to a real phone number via Evolution API.
 * Evolution API v1.x sends LID format (240552629022900@lid) in webhooks
 * which does NOT contain the phone number and cannot be used for sending.
 *
 * Strategy: get the LID contact's profilePictureUrl, then find the
 * @s.whatsapp.net contact with the same picture — that has the real number.
 */
async function resolvePhoneFromLid(lid: string): Promise<string | null> {
  const evoUrl = process.env.EVOLUTION_API_URL
  const instance = process.env.EVOLUTION_INSTANCE
  const apiKey = process.env.EVOLUTION_API_KEY

  if (!evoUrl || !instance || !apiKey) return null

  const headers = { 'Content-Type': 'application/json', apikey: apiKey }

  try {
    // Step 1: get the LID contact's profile picture
    const lidRes = await fetch(`${evoUrl}/chat/findContacts/${instance}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ where: { id: `${lid}@lid` } }),
    })
    if (!lidRes.ok) return null

    const lidContacts = await lidRes.json()
    if (!Array.isArray(lidContacts) || lidContacts.length === 0) return null

    const lidPic: string = lidContacts[0].profilePictureUrl ?? ''
    if (!lidPic) {
      console.log('[webhook] LID contact has no profile picture, cannot resolve')
      return null
    }

    // Step 2: find all contacts and match by profilePictureUrl
    const allRes = await fetch(`${evoUrl}/chat/findContacts/${instance}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    if (!allRes.ok) return null

    const allContacts = await allRes.json()
    if (!Array.isArray(allContacts)) return null

    const match = allContacts.find(
      (c: { id: string; profilePictureUrl?: string }) =>
        c.id.endsWith('@s.whatsapp.net') && c.profilePictureUrl === lidPic,
    )

    if (match) {
      const realPhone = match.id.split('@')[0].replace(/\D/g, '')
      console.log('[webhook] resolved LID', lid, '→', realPhone)
      return realPhone
    }

    console.log('[webhook] no @s.whatsapp.net match found for LID profile picture')
    return null
  } catch (err) {
    console.error('[webhook] resolvePhoneFromLid error:', err)
    return null
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Log every webhook event for debugging (accessible via /api/webhook/whatsapp/debug)
    logWebhook(body)
    console.log('[webhook] event:', body.event, 'fromMe:', body.data?.key?.fromMe,
      'remoteJid:', body.data?.key?.remoteJid,
      'hasMessage:', !!body.data?.message,
      'keys:', body.data?.message ? Object.keys(body.data.message).join(',') : 'none')

    // Accept all message-related events from Evolution API
    const event = body.event as string
    const MESSAGE_EVENTS = [
      'messages.upsert',  // standard incoming/outgoing
      'send.message',     // sent via API
      'messages.update',  // message status updates (may carry sent messages)
    ]
    if (!MESSAGE_EVENTS.includes(event)) {
      return Response.json({ ok: true })
    }

    const data = body.data
    if (!data?.key) {
      console.log('[webhook] no key in data, skipping')
      return Response.json({ ok: true })
    }

    // send.message events are always outbound
    const isFromMe = event === 'send.message' || !!data.key.fromMe

    // Extract phone number — remoteJid can be number@s.whatsapp.net or LID@lid
    const remoteJid: string = data.key.remoteJid ?? ''
    const jidValue = remoteJid.split('@')[0]
    const isLid = remoteJid.endsWith('@lid')

    if (!jidValue) {
      return Response.json({ ok: true })
    }

    // Resolve real phone number
    let phone: string
    if (isLid) {
      console.log('[webhook] LID detected:', jidValue, '— resolving real phone...')
      const resolved = await resolvePhoneFromLid(jidValue)
      if (resolved) {
        phone = resolved
      } else {
        console.log('[webhook] could not resolve LID, phone will be empty')
        phone = ''
      }
    } else {
      phone = jidValue
    }

    // Extract message text from all possible WhatsApp message formats
    const msg = data.message ?? {}
    const text: string =
      msg.conversation ??
      msg.extendedTextMessage?.text ??
      msg.imageMessage?.caption ??
      msg.videoMessage?.caption ??
      msg.documentMessage?.caption ??
      msg.buttonsResponseMessage?.selectedDisplayText ??
      msg.listResponseMessage?.title ??
      msg.templateButtonReplyMessage?.selectedDisplayText ??
      ''

    if (!text) {
      if (isFromMe) {
        console.log('[webhook] outbound message with no text, message keys:', Object.keys(msg).join(','))
      }
      return Response.json({ ok: true })
    }

    const normalizedPhone = phone ? normalize(phone) : ''
    const preview = text.length > 60 ? text.slice(0, 60) + '…' : text
    console.log(`[webhook] ${isFromMe ? 'OUT' : 'IN'} phone:`, normalizedPhone || '(unresolved LID)', preview)

    // Use service key to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

    // Find lead by phone — fetch all leads with a phone number
    const { data: leads } = await supabase
      .from('leads')
      .select('place_id, phone, status')
      .not('phone', 'is', null)

    const lead = (leads ?? []).find((l) =>
      l.phone ? phoneMatch(normalizedPhone, l.phone) : false
    )

    // Convert unix timestamp to ISO
    const timestamp = data.messageTimestamp
    const sentAt = timestamp
      ? new Date(Number(timestamp) * 1000).toISOString()
      : new Date().toISOString()

    let placeId: string
    let leadStatus: string | null = null

    if (lead) {
      placeId = lead.place_id
      leadStatus = lead.status

      // Update phone if we resolved a better one (e.g. from LID)
      if (isLid && isValidPhone(normalizedPhone) && normalizedPhone !== lead.phone) {
        await supabase
          .from('leads')
          .update({ phone: normalizedPhone })
          .eq('place_id', placeId)
        console.log('[webhook] updated phone for', placeId, 'to', normalizedPhone)
      }
    } else if (isFromMe) {
      // Outbound message to unknown number — skip, no lead to attach to
      console.log('[webhook] outbound message to unknown number, skipping')
      return Response.json({ ok: true })
    } else {
      // Create minimal lead for unknown inbound contact
      const pushName: string = data.pushName ?? ''
      placeId = normalizedPhone && isValidPhone(normalizedPhone)
        ? `unknown_${normalizedPhone}`
        : `unknown_${jidValue}`

      console.log('[webhook] creating inbound lead for', placeId)

      const { error: leadError } = await supabase.from('leads').upsert({
        place_id: placeId,
        business_name: pushName || normalizedPhone || jidValue,
        phone: isValidPhone(normalizedPhone) ? normalizedPhone : null,
        outreach_channel: 'whatsapp',
        status: 'replied',
        niche: 'inbound',
        status_updated_at: new Date().toISOString(),
      }, { onConflict: 'place_id' })

      if (leadError) {
        console.error('[webhook] failed to upsert inbound lead:', leadError.message)
      }
    }

    // For outbound messages sent from the phone, check for duplicates
    // (the dashboard send flow already saves its own conversation record)
    if (isFromMe) {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('place_id', placeId)
        .eq('direction', 'out')
        .eq('message', text)
        .gte('sent_at', new Date(Date.now() - 60_000).toISOString())
        .limit(1)

      if (existing && existing.length > 0) {
        console.log('[webhook] outbound message already saved by send flow, skipping duplicate')
        return Response.json({ ok: true })
      }

      // Save outbound message from phone
      const { error: convError } = await supabase
        .from('conversations')
        .insert({
          place_id: placeId,
          direction: 'out',
          channel: 'whatsapp',
          message: text,
          sent_at: sentAt,
          suggested_by_ai: false,
        })

      if (convError) {
        console.error('[webhook] failed to save outbound conversation:', convError.message)
      }

      console.log('[webhook] saved outbound message for lead', placeId)
      return Response.json({ ok: true })
    }

    // ─── Inbound message handling below ───

    // Dedup: Evolution API may send the same webhook multiple times
    const { data: inboundDup } = await supabase
      .from('conversations')
      .select('id')
      .eq('place_id', placeId)
      .eq('direction', 'in')
      .eq('message', text)
      .gte('sent_at', new Date(new Date(sentAt).getTime() - 5_000).toISOString())
      .lte('sent_at', new Date(new Date(sentAt).getTime() + 5_000).toISOString())
      .limit(1)

    if (inboundDup && inboundDup.length > 0) {
      console.log('[webhook] duplicate inbound message detected, skipping')
      return Response.json({ ok: true })
    }

    // Save conversation
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .insert({
        place_id: placeId,
        direction: 'in',
        channel: 'whatsapp',
        message: text,
        sent_at: sentAt,
        suggested_by_ai: false,
      })
      .select('id')
      .single()

    if (convError) {
      console.error('[webhook] failed to save conversation:', convError.message)
    }

    // Detect bot/auto-reply messages
    // Check content patterns and response speed
    const { data: lastOutbound } = await supabase
      .from('conversations')
      .select('sent_at')
      .eq('place_id', placeId)
      .eq('direction', 'out')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const autoReplyByContent = isAutoReply(text)
    const autoReplyBySpeed = isInstantReply(
      timestamp ? Number(timestamp) : sentAt,
      lastOutbound?.sent_at ?? null,
    )
    const isAutoReplyMessage = autoReplyByContent || autoReplyBySpeed

    if (isAutoReplyMessage) {
      console.log('[webhook] auto-reply detected for', placeId,
        autoReplyByContent ? '(content match)' : '(instant reply)')

      // Don't advance status for auto-replies — they're not real engagement
      // Save a flag in the conversation for visibility
      if (conv?.id) {
        await supabase
          .from('conversations')
          .update({ approved_by: 'auto-reply' })
          .eq('id', conv.id)
      }

      console.log('[webhook] saved auto-reply message for lead', placeId, '(skipping AI)')
      return Response.json({ ok: true })
    }

    // Auto-advance: sent → replied (only for genuine replies)
    if (leadStatus === 'sent') {
      await supabase
        .from('leads')
        .update({
          status: 'replied',
          status_updated_at: new Date().toISOString(),
        })
        .eq('place_id', placeId)
    }

    // Fire and forget — AI classify + suggest (only for genuine replies)
    const fullLead = await supabase
      .from('leads')
      .select('*')
      .eq('place_id', placeId)
      .single()

    if (fullLead.data) {
      const history = await getRecentConversations(supabase, placeId, 5)
      console.log('[webhook] firing classifyAndSuggest for', placeId)
      classifyAndSuggest(
        fullLead.data as Lead,
        text,
        history,
        conv?.id,
      ).catch((err) => {
        console.error('[classify] failed:', err.message)
      })
    }

    console.log('[webhook] saved inbound message for lead', placeId)
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[webhook] error:', err)
    // Always return 200 to prevent Evolution API retries
    return Response.json({ ok: true })
  }
}
