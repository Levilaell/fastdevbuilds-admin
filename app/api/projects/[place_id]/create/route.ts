import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { getRecentConversations } from '@/lib/supabase/queries'
import { generateClaudeCodePrompt } from '@/lib/ai-workflow'
import type { Conversation, Lead, Project } from '@/lib/types'

// Arquitetura C: Opus + Getimg + Supabase upload leva 30-90s.
// Requer Vercel Pro (maxDuration até 300s).
export const maxDuration = 300

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const notes = typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim() : null

  const supabase = createServiceClient()

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('*')
    .eq('place_id', place_id)
    .maybeSingle()

  if (leadErr) {
    return Response.json({ error: leadErr.message }, { status: 500 })
  }
  if (!lead) {
    return Response.json({ error: 'Lead not found' }, { status: 404 })
  }

  const { data: existing, error: existingErr } = await supabase
    .from('projects')
    .select('id')
    .eq('place_id', place_id)
    .maybeSingle()

  if (existingErr) {
    return Response.json({ error: existingErr.message }, { status: 500 })
  }
  if (existing) {
    return Response.json({ error: 'Project already exists for this lead' }, { status: 409 })
  }

  const { data: project, error: insertErr } = await supabase
    .from('projects')
    .insert({
      place_id,
      status: 'approved',
      notes,
      scope: null,
    })
    .select()
    .single()

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  const convs = await getRecentConversations(supabase, place_id, 20)
  // Aguarda geração completa — prompt + imagens Getimg + upload Supabase.
  // Sem await, Vercel mata a function assim que response sai, e a chamada
  // morre no meio. Leva 30-90s dependendo de quantas imagens premium Opus
  // pediu; maxDuration=300s cobre com folga.
  try {
    await generateClaudeCodePrompt(
      lead as Lead,
      project as Project,
      convs as Conversation[],
    )
  } catch (err) {
    console.error('[create-project] generateClaudeCodePrompt failed', err)
    // Não bloqueia a resposta — project já existe no banco, prompt pode
    // ser regenerado depois. Frontend vê project criado e segue.
  }

  return Response.json(project, { status: 201 })
}
