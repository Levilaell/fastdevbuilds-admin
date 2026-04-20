import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { SCORE_REASON_LABELS, type Lead, type Conversation, type Project } from '@/lib/types'
import {
  CLAUDE_CODE_SITE_SYSTEM_PROMPT,
  buildClaudeCodeUserPrompt,
} from '@/lib/prompts'

const MODEL_SMART = 'claude-opus-4-7'

function cleanJson(text: string): string {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )
}

function translateReasons(lead: Lead): string {
  return (lead.score_reasons ?? '')
    .split(',')
    .map(r => r.trim())
    .filter(Boolean)
    .map(r => SCORE_REASON_LABELS[r] ?? r)
    .join(', ')
}

// ─── Generate Claude Code Prompt ───

export async function generateClaudeCodePrompt(
  lead: Lead,
  project: Project,
  conversations: Conversation[],
): Promise<string> {
  const anthropic = new Anthropic()

  // Include last 20 messages for full context, formatted with role labels
  const conversationHistory = conversations
    .slice(-20)
    .map(c => `${c.direction === 'out' ? 'Levi' : 'Cliente'}: ${c.message}`)
    .join('\n')

  let scopeText = 'N/A'
  if (project.scope) {
    try {
      const items = JSON.parse(project.scope) as string[]
      scopeText = items.join('\n- ')
    } catch {
      scopeText = project.scope
    }
  }

  const reasonsText = translateReasons(lead)

  const response = await anthropic.messages.create({
    model: MODEL_SMART,
    max_tokens: 4500,
    system: CLAUDE_CODE_SITE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildClaudeCodeUserPrompt(lead, project, reasonsText, scopeText, conversationHistory),
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  let prompt: string
  let pendingInfo: string | null = null
  let infoRequestMessage: string | null = null

  try {
    const parsed = JSON.parse(cleanJson(text))
    prompt = parsed.prompt ?? text
    const placeholders = parsed.placeholders as string[] | undefined
    if (placeholders && placeholders.length > 0) {
      pendingInfo = JSON.stringify(placeholders)
    }
    infoRequestMessage = parsed.info_request_message ?? null
  } catch {
    // Fallback: if Claude didn't return valid JSON, use raw text as prompt
    prompt = text
  }

  const supabase = serviceClient()
  await supabase
    .from('projects')
    .update({
      claude_code_prompt: prompt,
      pending_info: pendingInfo,
      info_request_message: infoRequestMessage,
      prompt_updated_at: new Date().toISOString(),
    })
    .eq('place_id', lead.place_id)

  return prompt
}
