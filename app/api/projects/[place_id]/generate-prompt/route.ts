import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { getRecentConversations } from '@/lib/supabase/queries'
import { generateClaudeCodePrompt } from '@/lib/ai-workflow'
import type { Lead, Project, Conversation } from '@/lib/types'

// Arquitetura C: Opus + Getimg + Supabase upload leva 30-90s.
// Mesmo cap que /create — senão função morre antes de terminar.
export const maxDuration = 300

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })
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
