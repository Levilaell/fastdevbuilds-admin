import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getRecentConversations } from '@/lib/supabase/queries'
import { generateClaudeCodePrompt } from '@/lib/ai-workflow'
import type { Lead, Project, Conversation } from '@/lib/types'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  const { place_id } = await params
  const supabase = createServiceClient()

  const [leadRes, projectRes] = await Promise.all([
    supabase.from('leads').select('*').eq('place_id', place_id).single(),
    supabase.from('projects').select('*').eq('place_id', place_id).single(),
  ])

  if (!leadRes.data || !projectRes.data) {
    return Response.json({ error: 'Lead or project not found' }, { status: 404 })
  }

  const conversations = await getRecentConversations(supabase, place_id, 20)

  try {
    const prompt = await generateClaudeCodePrompt(
      leadRes.data as Lead,
      projectRes.data as Project,
      conversations as Conversation[],
    )
    return Response.json({ prompt })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate prompt'
    return Response.json({ error: message }, { status: 500 })
  }
}
