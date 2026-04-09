import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildPixMessage as generatePixMessage } from '@/lib/prompts'
import { sendWhatsApp } from '@/lib/whatsapp'
import type { Lead, Project } from '@/lib/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  const { place_id } = await params
  const body = await request.json()
  const pixKey: string = body.pix_key ?? process.env.PIX_KEY ?? ''

  if (!pixKey) {
    return Response.json({ error: 'PIX key required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const [leadRes, projectRes] = await Promise.all([
    supabase.from('leads').select('*').eq('place_id', place_id).single(),
    supabase.from('projects').select('*').eq('place_id', place_id).single(),
  ])

  if (!leadRes.data || !projectRes.data) {
    return Response.json({ error: 'Lead or project not found' }, { status: 404 })
  }

  const lead = leadRes.data as Lead
  const project = projectRes.data as Project

  if (!lead.phone) {
    return Response.json({ error: 'Lead não tem telefone cadastrado' }, { status: 400 })
  }

  const message = generatePixMessage(lead, project, pixKey)

  const sent = await sendWhatsApp(lead.phone, message)
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
    .update({ pix_key: pixKey, updated_at: new Date().toISOString() })
    .eq('place_id', place_id)

  return Response.json({ ok: true, message })
}
