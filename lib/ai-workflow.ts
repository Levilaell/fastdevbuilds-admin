import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { SCORE_REASON_LABELS, type Lead, type Conversation, type Project } from '@/lib/types'
import {
  CLASSIFY_SYSTEM_PROMPT,
  buildClassifyUserPrompt,
  PROPOSAL_SYSTEM_PROMPT,
  buildProposalUserPrompt,
  CLAUDE_CODE_SYSTEM_PROMPT,
  buildClaudeCodeUserPrompt,
  buildPixMessage,
} from '@/lib/prompts'

const MODEL_FAST = 'claude-haiku-4-5-20251001'
const MODEL_SMART = 'claude-sonnet-4-20250514'

function cleanJson(text: string): string {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

/** Validate classify response has required fields with correct types */
function validateClassifyResponse(obj: unknown): {
  intent: string
  confidence: number
  suggested_reply: string
} {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Claude returned invalid JSON structure')
  }
  const o = obj as Record<string, unknown>
  if (typeof o.intent !== 'string' || !o.intent) {
    throw new Error('Missing or invalid "intent" in Claude response')
  }
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) {
    // Clamp or default if out of range
    o.confidence = Math.max(0, Math.min(1, Number(o.confidence) || 0.5))
  }
  if (typeof o.suggested_reply !== 'string' || !o.suggested_reply) {
    throw new Error('Missing or invalid "suggested_reply" in Claude response')
  }
  return { intent: o.intent as string, confidence: o.confidence as number, suggested_reply: o.suggested_reply as string }
}

/** Validate proposal response has required fields with correct types */
function validateProposalResponse(obj: unknown): {
  scope: string[]
  timeline_days: number
  price_brl: number
  whatsapp_message: string
} {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Claude returned invalid JSON structure for proposal')
  }
  const o = obj as Record<string, unknown>
  if (!Array.isArray(o.scope) || o.scope.length === 0) {
    throw new Error('Missing or invalid "scope" in Claude proposal response')
  }
  if (typeof o.timeline_days !== 'number') {
    o.timeline_days = Number(o.timeline_days) || 7
  }
  if (typeof o.price_brl !== 'number') {
    o.price_brl = Number(o.price_brl) || 0
  }
  if (typeof o.whatsapp_message !== 'string' || !o.whatsapp_message) {
    throw new Error('Missing or invalid "whatsapp_message" in Claude proposal response')
  }
  return {
    scope: o.scope as string[],
    timeline_days: o.timeline_days as number,
    price_brl: o.price_brl as number,
    whatsapp_message: o.whatsapp_message as string,
  }
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

function formatHistory(conversations: Conversation[], limit: number): string {
  return conversations
    .slice(-limit)
    .map(c => `${c.direction === 'out' ? 'Levi' : 'Lead'}: ${c.message}`)
    .join('\n')
}

// ─── 1. Classify and Suggest ───

export async function classifyAndSuggest(
  lead: Lead,
  message: string,
  conversationHistory: Conversation[],
  conversationId?: string,
): Promise<void> {
  try {
    console.log('[classify] starting for', lead.place_id, 'message:', message.slice(0, 50))
    const anthropic = new Anthropic()

    const reasonsText = translateReasons(lead)
    const historyText = formatHistory(conversationHistory, 5)

    console.log('[classify] calling Claude API...')
    const response = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 500,
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildClassifyUserPrompt(lead, reasonsText, historyText, message),
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    console.log('[classify] response:', text.slice(0, 100))
    const parsed = validateClassifyResponse(JSON.parse(cleanJson(text)))

    console.log('[classify] saving suggestion, intent:', parsed.intent)
    const supabase = serviceClient()
    await supabase.from('ai_suggestions').insert({
      place_id: lead.place_id,
      conversation_id: conversationId ?? null,
      intent: parsed.intent,
      confidence: parsed.confidence,
      suggested_reply: parsed.suggested_reply,
      status: 'pending',
    })
  } catch (err) {
    console.error('[ai-workflow] classifyAndSuggest failed:', err)
  }
}

// ─── 2. Generate Proposal ───

export async function generateProposal(
  lead: Lead,
  conversations: Conversation[],
): Promise<void> {
  try {
    console.log('[proposal] starting for', lead.place_id)
    const supabase = serviceClient()

    // Check if project already exists — skip if proposal was previously dismissed
    const { data: existing } = await supabase
      .from('projects')
      .select('id, proposal_message')
      .eq('place_id', lead.place_id)
      .limit(1)
      .maybeSingle()

    if (existing && existing.proposal_message === null) {
      console.log('[proposal] proposal was previously dismissed, skipping regeneration for', lead.place_id)
      return
    }

    const anthropic = new Anthropic()
    const reasonsText = translateReasons(lead)
    const historyText = formatHistory(conversations, 10)

    console.log('[proposal] calling Claude API...')
    const response = await anthropic.messages.create({
      model: MODEL_SMART,
      max_tokens: 1000,
      system: PROPOSAL_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildProposalUserPrompt(lead, reasonsText, historyText),
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    console.log('[proposal] response:', text.slice(0, 150))
    const parsed = validateProposalResponse(JSON.parse(cleanJson(text)))

    if (existing) {
      console.log('[proposal] updating existing project', existing.id)
      const { error } = await supabase
        .from('projects')
        .update({
          scope: JSON.stringify(parsed.scope),
          price: parsed.price_brl,
          currency: 'BRL',
          status: 'scoped',
          proposal_message: parsed.whatsapp_message,
        })
        .eq('id', existing.id)
      if (error) console.error('[proposal] update error:', error.message)
    } else {
      console.log('[proposal] inserting new project')
      const { error } = await supabase.from('projects').insert({
        place_id: lead.place_id,
        scope: JSON.stringify(parsed.scope),
        price: parsed.price_brl,
        currency: 'BRL',
        status: 'scoped',
        proposal_message: parsed.whatsapp_message,
      })
      if (error) console.error('[proposal] insert error:', error.message)
    }

    console.log('[proposal] done for', lead.place_id)
  } catch (err) {
    console.error('[proposal] failed:', err)
  }
}

// ─── 3. Generate PIX Message ───

export { buildPixMessage as generatePixMessage }

// ─── 4. Generate Claude Code Prompt ───

export async function generateClaudeCodePrompt(
  lead: Lead,
  project: Project,
  conversations: Conversation[],
): Promise<string> {
  const anthropic = new Anthropic()

  // Include ALL conversation messages (not just filtered) so Claude has full context
  const relevantMessages = conversations
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
    max_tokens: 3000,
    system: CLAUDE_CODE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildClaudeCodeUserPrompt(lead, project, reasonsText, scopeText, relevantMessages),
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
