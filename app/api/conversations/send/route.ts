import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { sendWhatsApp, getOrAssignInstance, isValidPhone, resolvePhoneFromLid, getInstances } from '@/lib/whatsapp'

export async function POST(request: NextRequest) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const body = await request.json()
  const { place_id, message, channel, subject } = body as {
    place_id: string
    message: string
    channel: 'whatsapp' | 'email'
    subject?: string
  }

  if (!place_id || !message || !channel) {
    return Response.json(
      { error: 'place_id, message, and channel are required' },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()

  // Fetch lead for phone/email check
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('phone, email, evolution_instance, whatsapp_jid')
    .eq('place_id', place_id)
    .maybeSingle()

  if (leadError) {
    return Response.json({ error: leadError.message }, { status: 500 })
  }

  if (!lead) {
    return Response.json({ error: 'Lead não encontrado' }, { status: 404 })
  }

  // Send via WhatsApp
  if (channel === 'whatsapp') {
    let phone = lead.phone?.trim() || null

    // Fallback 1: extract phone from place_id for unknown inbound leads
    if (!phone && place_id.startsWith('unknown_')) {
      const candidate = place_id.replace('unknown_', '')
      if (/^55\d{10,11}$/.test(candidate)) {
        phone = candidate
      }
    }

    // Fallback 2: find related lead on same evolution_instance with a phone
    // IMPORTANT: only use when there's exactly ONE other lead on the instance,
    // otherwise we'd send the message to the wrong person.
    if (!phone && lead.evolution_instance) {
      const { data: related } = await supabase
        .from('leads')
        .select('phone')
        .eq('evolution_instance', lead.evolution_instance)
        .not('phone', 'is', null)
        .neq('place_id', place_id)
        .limit(2)
      if (related && related.length === 1 && related[0].phone?.trim()) {
        phone = related[0].phone.trim()
      }
    }

    // Fallback 3: extract phone from whatsapp_jid (@s.whatsapp.net format)
    if (!phone && lead.whatsapp_jid) {
      const jid = lead.whatsapp_jid as string
      if (jid.endsWith('@s.whatsapp.net')) {
        const candidate = jid.split('@')[0].replace(/\D/g, '')
        if (isValidPhone(candidate)) {
          phone = candidate
        }
      } else if (jid.endsWith('@lid')) {
        // Fallback 4: resolve LID to phone via Evolution API
        const lidValue = jid.split('@')[0]
        const instName = lead.evolution_instance as string | undefined
        const inst = instName
          ? getInstances().find(i => i.name === instName)
          : undefined
        const resolved = await resolvePhoneFromLid(lidValue, inst?.name, inst?.apiKey)
        if (resolved && isValidPhone(resolved)) {
          phone = resolved
        }
      }
    }

    // Persist resolved phone for future sends
    if (phone && !lead.phone) {
      await supabase.from('leads').update({ phone }).eq('place_id', place_id)
    }

    if (!phone) {
      return Response.json({ error: 'Lead não tem telefone cadastrado' }, { status: 400 })
    }
    const instance = await getOrAssignInstance(supabase, place_id)
    const sent = await sendWhatsApp(phone, message, instance?.name)
    if (!sent) {
      return Response.json({ error: 'Falha ao enviar WhatsApp' }, { status: 502 })
    }
  }

  // Send via email (Instantly API or SMTP fallback)
  if (channel === 'email') {
    const email = lead.email?.trim()
    if (!email) {
      return Response.json({ error: 'Lead has no email address' }, { status: 400 })
    }

    const apiKey = process.env.INSTANTLY_API_KEY
    const campaignId = process.env.INSTANTLY_CAMPAIGN_ID
    if (!apiKey || !campaignId) {
      return Response.json({ error: 'Instantly not configured (missing API key or campaign ID)' }, { status: 501 })
    }

    // Send reply via Instantly API v1 — add as a new lead with the reply as the message
    // For replies within existing threads, Instantly routes through the campaign's sending domain
    try {
      const res = await fetch('https://api.instantly.ai/api/v1/lead/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          campaign_id: campaignId,
          skip_if_in_workspace: false,
          leads: [{
            email,
            custom_variables: {
              message,
              email_subject: subject ?? 'Re: Your website',
            },
          }],
        }),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => String(res.status))
        console.error('[send] Instantly email failed:', errText)
        return Response.json({ error: `Email send failed: ${errText}` }, { status: 502 })
      }
    } catch (err) {
      console.error('[send] Instantly email error:', err)
      return Response.json({ error: 'Failed to send email via Instantly' }, { status: 502 })
    }
  }

  // Save conversation
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({
      place_id,
      direction: 'out',
      channel,
      message,
      subject: channel === 'email' ? (subject || null) : null,
      sent_at: new Date().toISOString(),
      suggested_by_ai: false,
    })
    .select()
    .single()

  if (convError) {
    return Response.json({ error: convError.message }, { status: 500 })
  }

  // Dismiss any pending AI suggestions — user replied manually
  await supabase
    .from('ai_suggestions')
    .update({ status: 'rejected' })
    .eq('place_id', place_id)
    .eq('status', 'pending')

  // Auto-advance status based on current state
  const { data: leadCheck } = await supabase
    .from('leads')
    .select('status')
    .eq('place_id', place_id)
    .maybeSingle()

  if (leadCheck?.status === 'prospected') {
    // First manual message → mark as sent
    await supabase
      .from('leads')
      .update({
        status: 'sent',
        outreach_sent: true,
        outreach_sent_at: new Date().toISOString(),
        outreach_channel: channel,
        status_updated_at: new Date().toISOString(),
      })
      .eq('place_id', place_id)
  } else if (leadCheck?.status === 'replied') {
    // Reply to lead → negotiating
    await supabase
      .from('leads')
      .update({
        status: 'negotiating',
        status_updated_at: new Date().toISOString(),
      })
      .eq('place_id', place_id)
  }

  return Response.json(conv)
}
