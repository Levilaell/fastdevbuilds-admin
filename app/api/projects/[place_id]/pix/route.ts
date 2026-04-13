import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { buildPixMessage as generatePixMessage } from '@/lib/prompts'
import { sendWhatsApp, getOrAssignInstance } from '@/lib/whatsapp'
import type { Lead, Project } from '@/lib/types'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })
  const pixKey = process.env.PIX_KEY ?? ''

  if (!pixKey) {
    return Response.json({ error: 'PIX key not configured on server' }, { status: 500 })
  }

  const supabase = createServiceClient()

  const [leadRes, projectRes] = await Promise.all([
    supabase.from('leads').select('*').eq('place_id', place_id).maybeSingle(),
    supabase.from('projects').select('*').eq('place_id', place_id).maybeSingle(),
  ])

  if (leadRes.error || projectRes.error) {
    return Response.json({ error: (leadRes.error ?? projectRes.error)!.message }, { status: 500 })
  }

  if (!leadRes.data || !projectRes.data) {
    return Response.json({ error: 'Lead or project not found' }, { status: 404 })
  }

  const lead = leadRes.data as Lead
  const project = projectRes.data as Project

  if (!lead.phone) {
    return Response.json({ error: 'Lead não tem telefone cadastrado' }, { status: 400 })
  }

  const message = generatePixMessage(lead, project, pixKey)

  const instance = await getOrAssignInstance(supabase, place_id)
  const sent = await sendWhatsApp(lead.phone, message, instance?.name)
  if (!sent) {
    return Response.json({ error: 'Falha ao enviar WhatsApp' }, { status: 502 })
  }

  // Save outbound conversation
  await supabase.from('conversations').insert({
    place_id,
    direction: 'out',
    channel: 'whatsapp',
    message,
    sent_at: new Date().toISOString(),
    suggested_by_ai: false,
  })

  // Save PIX key on project
  await supabase
    .from('projects')
    .update({ pix_key: pixKey })
    .eq('place_id', place_id)

  return Response.json({ ok: true, message })
}
