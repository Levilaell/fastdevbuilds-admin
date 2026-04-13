import { createClient } from '@supabase/supabase-js'
import { getRecentConversations } from '@/lib/supabase/queries'
import { classifyAndSuggest } from '@/lib/ai-workflow'
import { isAutoReply, isInstantReply } from '@/lib/auto-reply'
import { normalizePhone, phoneMatch, getInstances, getInstanceByKey } from '@/lib/whatsapp'
import { logWebhook } from './debug/route'
import type { Lead } from '@/lib/types'

/** Check if a normalized phone looks like a valid BR number. */
function isValidPhone(phone: string): boolean {
  return phone.startsWith('55') && phone.length >= 12 && phone.length <= 13
}

/**
 * Resolve a LID (Link ID) to a real phone number via Evolution API.
 * Evolution API v1.x sends LID format (240552629022900@lid) in webhooks
 * which does NOT contain the phone number and cannot be used for sending.
 *
 * Strategy: get the LID contact's profilePictureUrl, then find the
 * @s.whatsapp.net contact with the same picture — that has the real number.
 */
async function resolvePhoneFromLid(
  lid: string,
  instanceName?: string,
  instanceApiKey?: string,
): Promise<string | null> {
  const evoUrl = process.env.EVOLUTION_API_URL
  const instance = instanceName ?? process.env.EVOLUTION_INSTANCE_1
  const apiKey = instanceApiKey ?? process.env.EVOLUTION_API_KEY_1

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

    // Validate webhook authenticity
    // Evolution API may send the key in headers OR not at all
    const headerKey = request.headers.get('apikey') ?? request.headers.get('x-api-key')
    const bodyKey = typeof body.apikey === 'string' ? body.apikey : undefined
    const webhookKey = headerKey ?? bodyKey
    const globalKey = process.env.EVOLUTION_API_KEY
    const matchedInstance = webhookKey ? getInstanceByKey(webhookKey) : undefined
    const isGlobalKey = !matchedInstance && !!globalKey && webhookKey === globalKey
    // Always accept — the webhook URL itself is the secret.
    // If key matches an instance or global, we use it to identify the sender.
    // If not, we determine the instance from the body instead.
    if (webhookKey && !matchedInstance && !isGlobalKey) {
      console.log('[webhook] unrecognized key:', webhookKey.slice(0, 8) + '... — accepting anyway')
    }

    // Determine which instance sent this webhook
    // Evolution API may use: instance, instanceName, sender, or nested instance.instanceName
    const bodyInstance: string =
      (typeof body.instance === 'string' ? body.instance : '')
      || body.instanceName
      || body.sender
      || body.data?.instance?.instanceName
      || ''
    const instances = getInstances()
    const resolvedInstance = matchedInstance
      ?? instances.find(i => i.name === bodyInstance)
      ?? instances[0]
    const webhookInstanceName = resolvedInstance?.name ?? ''
    const webhookInstanceKey = resolvedInstance?.apiKey ?? ''

    // Log every webhook event for debugging (accessible via /api/webhook/whatsapp/debug)
    logWebhook(body)
    console.log('[webhook] event:', body.event,
      'bodyInstance:', bodyInstance, 'resolvedTo:', webhookInstanceName,
      'isGlobalKey:', isGlobalKey, 'topKeys:', Object.keys(body).join(','),
      'fromMe:', body.data?.key?.fromMe,
      'remoteJid:', body.data?.key?.remoteJid,
      'hasMessage:', !!body.data?.message,
      'keys:', body.data?.message ? Object.keys(body.data.message).join(',') : 'none')

    // Accept all message-related events from Evolution API
    // Normalize: Evolution API may send lowercase (messages.upsert) or uppercase (MESSAGES_UPSERT)
    const rawEvent = (body.event as string) ?? ''
    const event = rawEvent.toLowerCase().replace(/_/g, '.')
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
      console.log('[webhook] LID detected:', jidValue, '— resolving via', webhookInstanceName)
      const resolved = await resolvePhoneFromLid(jidValue, webhookInstanceName, webhookInstanceKey)
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

    const normalizedPhone = phone ? normalizePhone(phone) : ''
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
      .select('place_id, phone, status, evolution_instance')
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
      // Also store which instance this lead is associated with if not yet set
      const leadUpdates: Record<string, string> = {}
      if (isLid && isValidPhone(normalizedPhone) && normalizedPhone !== lead.phone) {
        leadUpdates.phone = normalizedPhone
      }
      if (!lead.evolution_instance) {
        leadUpdates.evolution_instance = webhookInstanceName
      }
      if (Object.keys(leadUpdates).length > 0) {
        await supabase.from('leads').update(leadUpdates).eq('place_id', placeId)
        if (leadUpdates.phone) console.log('[webhook] updated phone for', placeId, 'to', normalizedPhone)
        if (leadUpdates.evolution_instance) console.log('[webhook] assigned instance', webhookInstanceName, 'to', placeId)
      }
    } else if (isFromMe) {
      // No lead matched by phone — try matching by LID-based place_id
      // (inbound messages from LIDs create leads as unknown_${jidValue})
      const lidPlaceId = `unknown_${jidValue}`
      const { data: lidLead } = await supabase
        .from('leads')
        .select('place_id, status')
        .eq('place_id', lidPlaceId)
        .maybeSingle()

      if (lidLead) {
        placeId = lidLead.place_id
        leadStatus = lidLead.status
        console.log('[webhook] matched outbound to LID-based lead:', placeId)
      } else {
        console.log('[webhook] outbound message to unknown number, skipping')
        return Response.json({ ok: true })
      }
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
        evolution_instance: webhookInstanceName,
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

    // Detect bot/auto-reply BEFORE saving — prevents DB triggers from
    // firing classifyAndSuggest on auto-reply conversations.
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

      // Save conversation with auto-reply flag already set
      await supabase
        .from('conversations')
        .insert({
          place_id: placeId,
          direction: 'in',
          channel: 'whatsapp',
          message: text,
          sent_at: sentAt,
          suggested_by_ai: false,
          approved_by: 'auto-reply',
        })

      // Revert any DB-trigger status advancement — a Supabase trigger may have
      // already moved sent→replied when the conversation was inserted.
      // Roll it back since auto-replies are not genuine engagement.
      if (leadStatus === 'sent') {
        await supabase
          .from('leads')
          .update({ status: 'sent', status_updated_at: new Date().toISOString() })
          .eq('place_id', placeId)
        console.log('[webhook] reverted trigger-based status advance for auto-reply')
      }

      // Dismiss any AI suggestions that a DB trigger may have created for this auto-reply.
      // The trigger fires classifyAndSuggest asynchronously, so we dismiss now AND after a delay.
      const dismissAutoReplySuggestions = async () => {
        await supabase
          .from('ai_suggestions')
          .update({ status: 'rejected' })
          .eq('place_id', placeId)
          .eq('status', 'pending')
      }
      await dismissAutoReplySuggestions()
      // Fire delayed cleanup to catch async trigger-created suggestions
      setTimeout(() => { dismissAutoReplySuggestions().catch(console.error) }, 5_000)
      setTimeout(() => { dismissAutoReplySuggestions().catch(console.error) }, 15_000)

      console.log('[webhook] saved auto-reply message for lead', placeId, '(skipping AI)')
      return Response.json({ ok: true })
    }

    // ─── Genuine inbound message ───

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
