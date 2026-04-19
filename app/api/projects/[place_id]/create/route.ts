import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { getRecentConversations } from '@/lib/supabase/queries'
import { generateClaudeCodePrompt } from '@/lib/ai-workflow'
import type { Conversation, Lead, Project } from '@/lib/types'

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
  generateClaudeCodePrompt(
    lead as Lead,
    project as Project,
    convs as Conversation[],
  ).catch(console.error)

  return Response.json(project, { status: 201 })
}
