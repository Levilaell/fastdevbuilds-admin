import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { SCORE_REASON_LABELS, type Lead, type Conversation, type Project } from '@/lib/types'

const MODEL = 'claude-haiku-4-5-20251001'

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

    console.log('[classify] calling Claude API...')
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: `You are an assistant that analyzes lead responses for a software development freelancer named Levi.
Classify the intent of the message and suggest the best reply in Brazilian Portuguese.

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "intent": "interested|asked_price|asked_scope|objection|not_interested|scheduling|other",
  "confidence": 0.0 to 1.0,
  "suggested_reply": "suggested message in informal Brazilian Portuguese, max 4 sentences, no call suggestions, sign as Levi"
}`,
      messages: [
        {
          role: 'user',
          content: `Business: ${lead.business_name ?? 'Desconhecido'}
Detected problems: ${translateReasons(lead)}
Original outreach message: ${lead.message ?? 'N/A'}
Conversation history:
${formatHistory(conversationHistory, 5)}
New message received: ${message}
Current pipeline stage: ${lead.status}`,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    console.log('[classify] response:', text.slice(0, 100))
    const parsed = JSON.parse(cleanJson(text)) as {
      intent: string
      confidence: number
      suggested_reply: string
    }

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
    const anthropic = new Anthropic()

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: `You are Levi, a freelance developer. Generate a project proposal in Brazilian Portuguese.
Respond ONLY with valid JSON:
{
  "scope": ["item 1", "item 2", "item 3"],
  "timeline_days": 5,
  "price_brl": 900,
  "whatsapp_message": "full formatted WhatsApp message with scope, timeline, price and 'só paga se gostar' guarantee, signed as Levi, max 15 lines"
}`,
      messages: [
        {
          role: 'user',
          content: `Business: ${lead.business_name ?? 'Desconhecido'}
Current site: ${lead.website ?? 'N/A'}
Tech stack: ${lead.tech_stack ?? 'unknown'}
Detected problems: ${translateReasons(lead)}
Conversation (last 10 messages):
${formatHistory(conversations, 10)}`,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(cleanJson(text)) as {
      scope: string[]
      timeline_days: number
      price_brl: number
      whatsapp_message: string
    }

    const supabase = serviceClient()
    await supabase.from('projects').upsert(
      {
        place_id: lead.place_id,
        scope: JSON.stringify(parsed.scope),
        price: parsed.price_brl,
        currency: 'BRL',
        status: 'scoped',
        proposal_message: parsed.whatsapp_message,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'place_id' },
    )
  } catch (err) {
    console.error('[ai-workflow] generateProposal failed:', err)
  }
}

// ─── 3. Generate PIX Message ───

export function generatePixMessage(
  lead: Lead,
  project: Project,
  pixKey: string,
): string {
  const fmtPrice = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(project.price ?? 0)

  return `${lead.business_name ?? 'Olá'}, que ótimo que gostou!

Para concluir, segue o PIX:

Chave: ${pixKey}
Valor: ${fmtPrice}
Nome: Levi Laell

Assim que confirmar o pagamento, passo as instruções finais.

Levi`
}

// ─── 4. Generate Claude Code Prompt ───

export async function generateClaudeCodePrompt(
  lead: Lead,
  project: Project,
  conversations: Conversation[],
): Promise<string> {
  const anthropic = new Anthropic()

  const relevantMessages = conversations
    .filter(c => {
      const lower = c.message.toLowerCase()
      return (
        lower.includes('site') ||
        lower.includes('página') ||
        lower.includes('page') ||
        lower.includes('design') ||
        lower.includes('funcionalidade') ||
        lower.includes('feature') ||
        lower.includes('quero') ||
        lower.includes('preciso') ||
        c.direction === 'in'
      )
    })
    .slice(-10)
    .map(c => `${c.direction === 'out' ? 'Levi' : 'Client'}: ${c.message}`)
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

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `Generate a complete, detailed prompt for Claude Code to execute a web development project.
The prompt must contain ALL context needed to execute without asking questions.
Write in English. Be specific and actionable.

Include:
1. Client context and project overview
2. Recommended tech stack for delivery
3. Step-by-step what needs to be done
4. What to preserve from current site (if redesign)
5. Specific technical requirements
6. How to deliver (preview URL first, domain migration after approval)
7. Performance targets if applicable`,
    messages: [
      {
        role: 'user',
        content: `Client: ${lead.business_name ?? 'Unknown'}
Current site: ${lead.website ?? 'N/A'}
Detected tech stack: ${lead.tech_stack ?? 'unknown'}
Problems found: ${translateReasons(lead)}
Project scope:
- ${scopeText}
Price: R$ ${project.price ?? 0}
Relevant conversation excerpts:
${relevantMessages || 'No conversation data'}`,
      },
    ],
  })

  const prompt = response.content[0].type === 'text' ? response.content[0].text : ''

  const supabase = serviceClient()
  await supabase
    .from('projects')
    .update({ claude_code_prompt: prompt, updated_at: new Date().toISOString() })
    .eq('place_id', lead.place_id)

  return prompt
}
