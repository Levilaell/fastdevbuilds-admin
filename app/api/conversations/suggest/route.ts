import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
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

  const supabase = await createClient()

  const [leadResult, convResult] = await Promise.all([
    supabase.from('leads').select('*').eq('place_id', place_id).single(),
    supabase
      .from('conversations')
      .select('*')
      .eq('place_id', place_id)
      .order('sent_at', { ascending: true }),
  ])

  if (leadResult.error) {
    return Response.json({ error: leadResult.error.message }, { status: 500 })
  }

  const lead = leadResult.data as Lead
  const conversations = (convResult.data ?? []) as Conversation[]

  const reasons = (lead.score_reasons ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => SCORE_REASON_LABELS[r] ?? r)
    .join(', ')

  const historyText = conversations
    .map((c) => `[${c.direction === 'out' ? 'Levi' : 'Lead'}] ${c.message}`)
    .join('\n')

  const systemPrompt = buildSuggestionSystemPrompt(lead, reasons, STATUS_LABELS[lead.status])

  const anthropic = new Anthropic()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: historyText
          ? SUGGESTION_USER_WITH_HISTORY(historyText)
          : SUGGESTION_USER_NO_HISTORY,
      },
    ],
  })

  const suggestion =
    response.content[0].type === 'text' ? response.content[0].text : ''

  return Response.json({ suggestion })
}
