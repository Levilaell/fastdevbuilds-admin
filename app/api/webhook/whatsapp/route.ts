import { createClient } from '@supabase/supabase-js'

const normalize = (phone: string) => phone.replace(/\D/g, '')

function phoneMatch(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false
  const tail = Math.min(na.length, nb.length, 10)
  return na.slice(-tail) === nb.slice(-tail)
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

    // Extract phone number — remove @s.whatsapp.net suffix
    const remoteJid: string = data.key.remoteJid ?? ''
    const phone = remoteJid.split('@')[0]

    if (!phone) {
      return Response.json({ ok: true })
    }

    // Extract message text from various WhatsApp message formats
    const text: string =
      data.message?.conversation ??
      data.message?.extendedTextMessage?.text ??
      ''

    if (!text) {
      return Response.json({ ok: true })
    }

    const preview = text.length > 60 ? text.slice(0, 60) + '…' : text
    console.log('[webhook]', phone, preview)

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
      l.phone ? phoneMatch(phone, l.phone) : false
    )

    if (!lead) {
      console.log('[webhook] no matching lead for phone', phone)
      return Response.json({ ok: true })
    }

    // Convert unix timestamp to ISO
    const timestamp = data.messageTimestamp
    const sentAt = timestamp
      ? new Date(Number(timestamp) * 1000).toISOString()
      : new Date().toISOString()

    // Save conversation
    await supabase.from('conversations').insert({
      place_id: lead.place_id,
      direction: 'in',
      channel: 'whatsapp',
      message: text,
      sent_at: sentAt,
      suggested_by_ai: false,
    })

    // Auto-advance: sent → replied
    if (lead.status === 'sent') {
      await supabase
        .from('leads')
        .update({
          status: 'replied',
          status_updated_at: new Date().toISOString(),
        })
        .eq('place_id', lead.place_id)
    }

    console.log('[webhook] saved message for lead', lead.place_id)
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[webhook] error:', err)
    // Always return 200 to prevent Evolution API retries
    return Response.json({ ok: true })
  }
}
