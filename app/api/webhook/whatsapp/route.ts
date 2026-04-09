import { createClient } from '@supabase/supabase-js'
import { getRecentConversations } from '@/lib/supabase/queries'
import { classifyAndSuggest } from '@/lib/ai-workflow'
import type { Lead } from '@/lib/types'

function normalize(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  const clean = digits.startsWith('0') ? digits.slice(1) : digits
  return `55${clean}`
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
 * LID format: 240552629022900@lid — does NOT contain the phone number.
 * We call the Evolution API findContacts endpoint to get the real number.
 */
async function resolvePhoneFromLid(lid: string): Promise<string | null> {
  const evoUrl = process.env.EVOLUTION_API_URL
  const instance = process.env.EVOLUTION_INSTANCE
  const apiKey = process.env.EVOLUTION_API_KEY

  if (!evoUrl || !instance || !apiKey) return null

  try {
    const res = await fetch(`${evoUrl}/chat/findContacts/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({ where: { id: `${lid}@lid` } }),
    })

    if (!res.ok) {
      console.error('[webhook] findContacts failed:', res.status)
      return null
    }

    const contacts = await res.json()
    console.log('[webhook] findContacts response:', JSON.stringify(contacts).slice(0, 300))

    // Response is an array of contacts, each with an `id` field like "5517992005945@s.whatsapp.net"
    if (Array.isArray(contacts) && contacts.length > 0) {
      const contact = contacts[0]
      // Try various fields where the real number might be
      const realJid: string = contact.id ?? contact.jid ?? contact.number ?? ''
      const realPhone = realJid.split('@')[0].replace(/\D/g, '')
      if (realPhone && realPhone.length >= 10) {
        console.log('[webhook] resolved LID', lid, '→', realPhone)
        return realPhone
      }
    }

    return null
  } catch (err) {
    console.error('[webhook] resolvePhoneFromLid error:', err)
    return null
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Only process inbound messages
    if (body.event !== 'messages.upsert') {
      return Response.json({ ok: true })
    }

    const data = body.data
    if (!data?.key || data.key.fromMe) {
      return Response.json({ ok: true })
    }

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
        console.log('[webhook] could not resolve LID, using as-is')
        phone = jidValue
      }
    } else {
      phone = jidValue
    }

    // Extract message text from various WhatsApp message formats
    const text: string =
      data.message?.conversation ??
      data.message?.extendedTextMessage?.text ??
      ''

    if (!text) {
      return Response.json({ ok: true })
    }

    const normalizedPhone = normalize(phone)
    const preview = text.length > 60 ? text.slice(0, 60) + '…' : text
    console.log('[webhook] phone:', normalizedPhone, preview)

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
      if (isLid && normalizedPhone !== lead.phone) {
        await supabase
          .from('leads')
          .update({ phone: normalizedPhone })
          .eq('place_id', placeId)
        console.log('[webhook] updated phone for', placeId, 'to', normalizedPhone)
      }
    } else {
      // Create minimal lead for unknown inbound contact
      const pushName: string = data.pushName ?? ''
      placeId = `unknown_${normalizedPhone}`

      console.log('[webhook] creating inbound lead for', normalizedPhone)

      const { error: leadError } = await supabase.from('leads').upsert({
        place_id: placeId,
        business_name: pushName || normalizedPhone,
        phone: normalizedPhone,
        outreach_channel: 'whatsapp',
        status: 'replied',
        niche: 'inbound',
        status_updated_at: new Date().toISOString(),
      }, { onConflict: 'place_id' })

      if (leadError) {
        console.error('[webhook] failed to upsert inbound lead:', leadError.message)
      }
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

    // Auto-advance: sent → replied
    if (leadStatus === 'sent') {
      await supabase
        .from('leads')
        .update({
          status: 'replied',
          status_updated_at: new Date().toISOString(),
        })
        .eq('place_id', placeId)
    }

    // Fire and forget — AI classify + suggest
    if (lead) {
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
    }

    console.log('[webhook] saved message for lead', placeId)
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[webhook] error:', err)
    // Always return 200 to prevent Evolution API retries
    return Response.json({ ok: true })
  }
}
