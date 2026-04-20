import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { SCORE_REASON_LABELS, type Lead, type Conversation, type Project, type GeneratedImages } from '@/lib/types'
import {
  CLAUDE_CODE_SITE_SYSTEM_PROMPT,
  buildClaudeCodeUserPrompt,
} from '@/lib/prompts'
import { generateSiteImages } from '@/lib/image-generator'

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
  let services: string[] = []
  let palette: string | null = null

  try {
    const parsed = JSON.parse(cleanJson(text))
    prompt = parsed.prompt ?? text
    const placeholders = parsed.placeholders as string[] | undefined
    if (placeholders && placeholders.length > 0) {
      pendingInfo = JSON.stringify(placeholders)
    }
    infoRequestMessage = parsed.info_request_message ?? null
    if (Array.isArray(parsed.services)) {
      services = parsed.services.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
    }
    if (typeof parsed.palette === 'string' && parsed.palette.trim()) {
      palette = parsed.palette.trim()
    }
  } catch {
    // Fallback: if Claude didn't return valid JSON, use raw text as prompt
    prompt = text
  }

  // Best-effort image generation — fail silently so the prompt still reaches the user.
  let images: GeneratedImages | null = null
  if (palette && services.length > 0) {
    try {
      images = await generateSiteImages({
        niche: lead.niche ?? 'business',
        palette,
        services,
        projectId: project.id,
      })
    } catch (err) {
      console.error('[ai-workflow] generateSiteImages threw', err)
    }
  }

  if (images) {
    const lines = [
      '',
      '## Imagens disponíveis',
      `Hero: ${images.hero}`,
    ]
    if (images.services.length > 0) {
      lines.push('Serviços:')
      for (const s of images.services) {
        lines.push(`- ${s.name}: ${s.url}`)
      }
    }
    lines.push('')
    lines.push('Use essas URLs diretamente em <img src>. NÃO use placeholders coloridos ou gradientes onde houver imagem disponível.')
    prompt = `${prompt}\n${lines.join('\n')}`
  }

  const supabase = serviceClient()
  await supabase
    .from('projects')
    .update({
      claude_code_prompt: prompt,
      pending_info: pendingInfo,
      info_request_message: infoRequestMessage,
      prompt_updated_at: new Date().toISOString(),
      generated_images: images,
    })
    .eq('place_id', lead.place_id)

  return prompt
}
