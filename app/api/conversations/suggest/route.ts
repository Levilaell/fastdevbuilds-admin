import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { SCORE_REASON_LABELS, STATUS_LABELS, type Lead, type Conversation } from '@/lib/types'
import {
  buildSuggestionSystemPrompt,
  SUGGESTION_USER_WITH_HISTORY,
  SUGGESTION_USER_NO_HISTORY,
} from '@/lib/prompts'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { place_id } = body as { place_id: string }

  if (!place_id) {
    return Response.json({ error: 'place_id is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const [leadResult, convResult, projectResult] = await Promise.all([
    supabase.from('leads').select('*').eq('place_id', place_id).single(),
    supabase
      .from('conversations')
      .select('*')
      .eq('place_id', place_id)
      .order('sent_at', { ascending: true }),
    // Project surfaces preview_sent_at — used to detect that a BR
    // preview-first cold msg already went out, so the suggestion prompt
    // has to mirror the R$ 997 50/50 pricing instead of giving a range.
    supabase
      .from('projects')
      .select('preview_sent_at')
      .eq('place_id', place_id)
      .maybeSingle(),
  ])

  if (leadResult.error) {
    return Response.json({ error: leadResult.error.message }, { status: 500 })
  }

  const lead = leadResult.data as Lead
  const conversations = (convResult.data ?? []) as Conversation[]
  const project = projectResult.data as { preview_sent_at: string | null } | null

  const reasons = (lead.score_reasons ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => SCORE_REASON_LABELS[r] ?? r)
    .join(', ')

  const historyText = conversations
    .map((c) => `[${c.direction === 'out' ? 'Levi' : 'Lead'}] ${c.message}`)
    .join('\n')

  const inboundCount = conversations.filter((c) => c.direction === 'in').length
  const phase: 'inicial' | 'engajado' = inboundCount >= 3 ? 'engajado' : 'inicial'
  // Active when the BR preview-first cold msg has been dispatched — the
  // lead has already seen R$ 997 50/50 + refundable upfront.
  const previewFirstOfferActive =
    lead.country === 'BR' && !!project?.preview_sent_at
  const systemPrompt = buildSuggestionSystemPrompt(
    lead,
    reasons,
    STATUS_LABELS[lead.status],
    phase,
    previewFirstOfferActive,
  )

  const anthropic = new Anthropic()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: historyText
          ? SUGGESTION_USER_WITH_HISTORY(historyText, lead)
          : SUGGESTION_USER_NO_HISTORY,
      },
    ],
  })

  const suggestion =
    response.content[0].type === 'text' ? response.content[0].text : ''

  return Response.json({ suggestion })
}
