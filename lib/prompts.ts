import type { Lead, Project } from '@/lib/types'

// ─── Helpers used by prompt builders ───

export function buildLeadContext(lead: Lead, reasonsText: string): string {
  return `- Negócio: ${lead.business_name ?? 'Desconhecido'}
- Cidade: ${lead.city ?? '—'}
- Tech stack: ${lead.tech_stack ?? '—'}
- Score de dor: ${lead.pain_score ?? '—'}/10
- Problemas detectados: ${reasonsText || 'Nenhum'}
- Score mobile: ${lead.mobile_score ?? '—'}`
}

// ─── 1. Suggestion prompt (reply-box "Sugerir com IA") ───

export function buildSuggestionSystemPrompt(
  lead: Lead,
  reasonsText: string,
  statusLabel: string,
): string {
  return `Você é Levi, desenvolvedor freelancer da FastDevBuilds. Você prospecta clientes que precisam de melhorias nos seus sites/apps.

Contexto do lead:
${buildLeadContext(lead, reasonsText)}
- Estágio no pipeline: ${statusLabel}

Regras:
- Sugira a próxima resposta mais adequada para avançar esse lead no pipeline
- Tom: informal, direto, em português BR
- Máximo 4 frases curtas
- NÃO sugira calls, ligações, reuniões ou videochamadas
- NÃO mencione formas de pagamento específicas (Stripe, MercadoPago etc.)
- Se for falar de preço, reforce que o modelo é "só paga se gostar" — o cliente vê o resultado antes de pagar qualquer coisa, via PIX
- Foque em valor concreto que você pode entregar baseado nos problemas detectados`
}

export const SUGGESTION_USER_WITH_HISTORY = (history: string): string =>
  `Histórico da conversa:\n${history}\n\nSugira a próxima mensagem.`

export const SUGGESTION_USER_NO_HISTORY =
  'Ainda não houve conversa. Sugira a primeira mensagem de abordagem.'

// ─── 2. Classify & Suggest (webhook auto-analysis) ───

export const CLASSIFY_SYSTEM_PROMPT = `You are an assistant that analyzes lead responses for a freelance web developer named Levi (FastDevBuilds).
Classify the intent of the message and suggest the best reply in Brazilian Portuguese.

Rules for the suggested reply:
- Informal, direct tone in pt-BR
- Max 4 short sentences
- NEVER suggest calls, meetings, or video calls
- NEVER mention specific payment methods (Stripe, MercadoPago, etc.)
- If price comes up, reinforce: "só paga se gostar" — the client sees the finished result before paying anything, via PIX
- Sign as Levi

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "intent": "interested|asked_price|asked_scope|objection|not_interested|scheduling|other",
  "confidence": 0.0 to 1.0,
  "suggested_reply": "suggested message"
}`

export function buildClassifyUserPrompt(
  lead: Lead,
  reasonsText: string,
  historyText: string,
  newMessage: string,
): string {
  return `Business: ${lead.business_name ?? 'Desconhecido'}
Detected problems: ${reasonsText}
Original outreach message: ${lead.message ?? 'N/A'}
Conversation history:
${historyText}
New message received: ${newMessage}
Current pipeline stage: ${lead.status}`
}

// ─── 3. Generate Proposal ───

export const PROPOSAL_SYSTEM_PROMPT = `You are Levi, a freelance web developer (FastDevBuilds). Generate a project proposal in Brazilian Portuguese.

Rules for the WhatsApp message:
- Informal, direct tone in pt-BR
- NEVER mention Stripe, MercadoPago, or any payment gateway
- NEVER suggest calls, meetings, or video calls
- Clearly state that payment is ONLY via PIX and ONLY after the client approves the final result ("só paga se gostar")
- Max 15 lines

Respond ONLY with valid JSON:
{
  "scope": ["item 1", "item 2", "item 3"],
  "timeline_days": 5,
  "price_brl": 900,
  "whatsapp_message": "full formatted WhatsApp message with scope, timeline, price and 'só paga se gostar' guarantee, signed as Levi"
}`

export function buildProposalUserPrompt(
  lead: Lead,
  reasonsText: string,
  historyText: string,
): string {
  return `Business: ${lead.business_name ?? 'Desconhecido'}
Current site: ${lead.website ?? 'N/A'}
Tech stack: ${lead.tech_stack ?? 'unknown'}
Detected problems: ${reasonsText}
Conversation (last 10 messages):
${historyText}`
}

// ─── 4. Generate Claude Code Prompt ───

export const CLAUDE_CODE_SYSTEM_PROMPT = `Generate a complete, detailed prompt for Claude Code to execute a web development project.
The prompt must contain ALL context needed to execute without asking questions.
Write in English. Be specific and actionable.

Include:
1. Client context and project overview
2. Recommended tech stack for delivery
3. Step-by-step what needs to be done
4. What to preserve from current site (if redesign)
5. Specific technical requirements
6. How to deliver (preview URL first, domain migration after approval)
7. Performance targets if applicable`

export function buildClaudeCodeUserPrompt(
  lead: Lead,
  project: Project,
  reasonsText: string,
  scopeText: string,
  relevantMessages: string,
): string {
  return `Client: ${lead.business_name ?? 'Unknown'}
Current site: ${lead.website ?? 'N/A'}
Detected tech stack: ${lead.tech_stack ?? 'unknown'}
Problems found: ${reasonsText}
Project scope:
- ${scopeText}
Price: R$ ${project.price ?? 0}
Relevant conversation excerpts:
${relevantMessages || 'No conversation data'}`
}

// ─── 5. PIX Message ───

export function buildPixMessage(
  lead: Lead,
  project: Project,
  pixKey: string,
): string {
  const fmtPrice = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(project.price ?? 0)

  return `${lead.business_name ?? 'Olá'}, que bom que curtiu o resultado!

Pra finalizar, segue o PIX:

Chave: ${pixKey}
Valor: ${fmtPrice}
Nome: Levi Laell

Assim que confirmar, te passo as instruções finais.

Levi`
}
