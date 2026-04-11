import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { PROJECT_STATUSES, type ProjectStatus, type Lead, type Conversation, type Project } from '@/lib/types'
import { getRecentConversations } from '@/lib/supabase/queries'
import { generateClaudeCodePrompt } from '@/lib/ai-workflow'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  const { place_id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('place_id', place_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  const { place_id } = await params
  const body = await request.json()
  const newStatus = body.status as string

  if (!PROJECT_STATUSES.includes(newStatus as ProjectStatus)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Update project status
  const projectUpdates: Record<string, unknown> = {
    status: newStatus,
  }
  if (newStatus === 'client_approved') {
    projectUpdates.client_approved_at = new Date().toISOString()
  }

  const { data: project, error } = await supabase
    .from('projects')
    .update(projectUpdates)
    .eq('place_id', place_id)
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Update lead status for terminal project states
  if (newStatus === 'paid') {
    await supabase
      .from('leads')
      .update({ status: 'closed', status_updated_at: new Date().toISOString() })
      .eq('place_id', place_id)
  } else if (newStatus === 'cancelled') {
    await supabase
      .from('leads')
      .update({ status: 'lost', status_updated_at: new Date().toISOString() })
      .eq('place_id', place_id)
  }

  // Fire-and-forget: generate Claude Code prompt on client_approved
  if (newStatus === 'client_approved') {
    const [leadRes, convs] = await Promise.all([
      supabase.from('leads').select('*').eq('place_id', place_id).single(),
      getRecentConversations(supabase, place_id, 20),
    ])
    if (leadRes.data) {
      generateClaudeCodePrompt(
        leadRes.data as Lead,
        project as Project,
        convs as Conversation[],
      ).catch(console.error)
    }
  }

  return Response.json(project)
}
