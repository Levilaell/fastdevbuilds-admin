import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { sendWhatsApp, getOrAssignInstance } from '@/lib/whatsapp'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { id } = await params
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })
  const body = await request.json()
  const editedReply: string | undefined = body.edited_reply

  const supabase = createServiceClient()

  // Fetch the suggestion
  const { data: suggestion, error } = await supabase
    .from('ai_suggestions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!suggestion) {
    return Response.json({ error: 'Suggestion not found' }, { status: 404 })
  }

  const message = editedReply ?? suggestion.suggested_reply

  // Determine channel from the triggering conversation, or fall back to lead's outreach_channel
  let channel: 'whatsapp' | 'email' = 'whatsapp'
  if (suggestion.conversation_id) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('channel')
      .eq('id', suggestion.conversation_id)
      .maybeSingle()
    if (conv?.channel === 'email' || conv?.channel === 'whatsapp') {
      channel = conv.channel
    }
  }

  // Fetch lead contact info
  const { data: lead } = await supabase
    .from('leads')
    .select('phone, email, outreach_channel, evolution_instance')
    .eq('place_id', suggestion.place_id)
    .maybeSingle()

  // Fall back to lead's outreach_channel if conversation didn't determine it
  if (!suggestion.conversation_id && lead?.outreach_channel === 'email') {
    channel = 'email'
  }

  if (channel === 'whatsapp') {
    let phone = lead?.phone?.trim() || null

    // Fallback 1: extract phone from place_id for unknown inbound leads (unknown_5511999999999)
    if (!phone && suggestion.place_id.startsWith('unknown_')) {
      const candidate = suggestion.place_id.replace('unknown_', '')
      if (/^55\d{10,11}$/.test(candidate)) {
        phone = candidate
      }
    }

    // Fallback 2: find a related lead on the same evolution_instance that has a phone
    // IMPORTANT: only use when there's exactly ONE other lead on the instance,
    // otherwise we'd send the message to the wrong person.
    if (!phone && lead?.evolution_instance) {
      const { data: related } = await supabase
        .from('leads')
        .select('phone')
        .eq('evolution_instance', lead.evolution_instance)
        .not('phone', 'is', null)
        .neq('place_id', suggestion.place_id)
        .limit(2)
      if (related && related.length === 1 && related[0].phone?.trim()) {
        phone = related[0].phone.trim()
      }
    }

    // Persist resolved phone on this lead for future sends
    if (phone && !lead?.phone) {
      await supabase.from('leads').update({ phone }).eq('place_id', suggestion.place_id)
    }

    if (!phone) {
      return Response.json({ error: 'Lead não tem telefone cadastrado' }, { status: 400 })
    }
    const instance = await getOrAssignInstance(supabase, suggestion.place_id)
    const sent = await sendWhatsApp(phone, message, instance?.name)
    if (!sent) {
      return Response.json({ error: 'Falha ao enviar WhatsApp' }, { status: 502 })
    }
  } else {
    const email = lead?.email?.trim()
    if (!email) {
      return Response.json({ error: 'Lead não tem email cadastrado' }, { status: 400 })
    }
    const apiKey = process.env.INSTANTLY_API_KEY
    const campaignId = process.env.INSTANTLY_CAMPAIGN_ID
    if (!apiKey || !campaignId) {
      return Response.json({ error: 'Instantly not configured' }, { status: 501 })
    }
    const res = await fetch('https://api.instantly.ai/api/v1/lead/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        campaign_id: campaignId,
        skip_if_in_workspace: false,
        leads: [{
          email,
          custom_variables: { message, email_subject: 'Re: Your website' },
        }],
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => String(res.status))
      console.error('[ai-approve] Instantly email failed:', errText)
      return Response.json({ error: `Email send failed: ${errText}` }, { status: 502 })
    }
  }

  // Save outbound conversation
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({
      place_id: suggestion.place_id,
      direction: 'out',
      channel,
      message,
      sent_at: new Date().toISOString(),
      suggested_by_ai: true,
    })
    .select()
    .single()

  if (convError) {
    console.error('[ai-approve] failed to save conversation:', convError.message)
    return Response.json({ error: 'Mensagem enviada mas falha ao salvar conversa' }, { status: 500 })
  }

  // Mark suggestion as sent + dismiss other pending suggestions atomically
  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('ai_suggestions')
    .update({
      status: 'sent',
      suggested_reply: message,
      approved_at: now,
      sent_at: now,
    })
    .eq('id', id)
    .eq('status', 'pending') // only update if still pending (prevents double-approve race)

  if (updateError) {
    console.error('[ai-approve] failed to mark suggestion as sent:', updateError.message)
  }

  // Dismiss any other pending suggestions for this lead
  await supabase
    .from('ai_suggestions')
    .update({ status: 'rejected' })
    .eq('place_id', suggestion.place_id)
    .eq('status', 'pending')
    .neq('id', id) // exclude the one we just approved

  return Response.json({ ok: true, conversation: conv })
}
