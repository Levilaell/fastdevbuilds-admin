import type { Lead, Project } from '@/lib/types'

// ─── Helpers used by prompt builders ───

/** Classify PageSpeed performance into qualitative levels. */
function perfLabel(mobileScore: number | null, lcp: number | null): string | null {
  if (mobileScore != null) {
    if (mobileScore < 30) return 'desempenho muito ruim'
    if (mobileScore < 50) return 'desempenho ruim'
    if (mobileScore < 70) return 'desempenho mediano'
    return 'desempenho bom'
  }
  if (lcp != null) {
    if (lcp > 6000) return 'carregamento muito lento'
    if (lcp > 4000) return 'carregamento lento'
    if (lcp > 2500) return 'carregamento mediano'
    return 'carregamento rápido'
  }
  return null
}

export function buildLeadContext(lead: Lead, reasonsText: string): string {
  const lines = [
    `- Negócio: ${lead.business_name ?? 'Desconhecido'}`,
    `- Cidade: ${lead.city ?? '—'}`,
    `- Site: ${lead.website ?? 'sem site'}`,
    `- Tech stack: ${lead.tech_stack ?? '—'}`,
    `- Score de dor: ${lead.pain_score ?? '—'}/10`,
    `- Problemas detectados: ${reasonsText || 'Nenhum'}`,
  ]

  // Qualitative PageSpeed assessment — tested, not just guessed
  const perf = perfLabel(lead.mobile_score, lead.lcp)
  if (perf) lines.push(`- PageSpeed (testado pelo Google): ${perf}`)
  if (lead.has_ssl === false) lines.push('- SSL: NÃO tem (site inseguro)')
  if (lead.is_mobile_friendly === false) lines.push('- Mobile: NÃO é otimizado para celular')
  if (lead.scrape_failed) lines.push('- Análise do site: FALHOU (site pode estar offline ou bloqueando)')

  return lines.join('\n')
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
- Se o site foi testado, mencione que foi analisado e diga o resultado qualitativo (ex: "testei seu site e o desempenho tá bem ruim no celular")
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
- If the site was tested, mention that it was analyzed and describe the result qualitatively (e.g., "testei seu site e o desempenho tá bem ruim no celular"), NOT with specific numbers
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
  const perf = perfLabel(lead.mobile_score, lead.lcp)

  return `Business: ${lead.business_name ?? 'Desconhecido'}
Site: ${lead.website ?? 'N/A'}
Detected problems: ${reasonsText}
${perf ? `Site tested — result: ${perf}\n` : ''}Original outreach message: ${lead.message ?? 'N/A'}
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

export const CLAUDE_CODE_SYSTEM_PROMPT = `You generate implementation prompts for Claude Code based STRICTLY on what was discussed in the conversation with the client.

CRITICAL RULES:
- ONLY include features/pages/functionality that were EXPLICITLY discussed or agreed upon in the conversation
- DO NOT invent requirements, features, or pages that were not mentioned
- DO NOT assume a tech stack beyond Next.js 15 + Tailwind unless the client specifically requested something
- If information is missing (colors, images, texts, specific content), list it as a PLACEHOLDER — do NOT invent it
- Write in Portuguese (pt-BR)

You must respond with VALID JSON only (no markdown, no explanation) with this structure:
{
  "prompt": "the full Claude Code prompt in the exact format specified below",
  "placeholders": ["item 1 faltando", "item 2 faltando"],
  "info_request_message": "WhatsApp message asking the client for the missing info"
}

The "prompt" field must follow this exact structure:
## Contexto do cliente
[3-5 lines about who they are, what they do, what was agreed]

## O que fazer
[objective, short list based on REAL scope only]

## O que NÃO fazer
[explicit list of what is OUT of scope — anything not discussed]

## Stack
- Next.js 15 App Router + TypeScript
- Tailwind CSS
- [other dependencies ONLY if required by the actual scope]

## Integrações externas
[links and systems the client already uses and must be preserved, or "Nenhuma identificada"]

## Placeholders (pedir ao cliente)
[list of missing info: photos, texts, colors, etc.]

## Como entregar
- Deploy na Vercel como preview primeiro
- URL de preview para o cliente aprovar
- Só migrar domínio após aprovação e pagamento

## Meta de performance
- PageSpeed mobile > 90

The "info_request_message" must be a WhatsApp message in this format:
[Nome], para começar o seu projeto preciso de algumas informações:

[numbered list of placeholders]

Pode me mandar isso? Assim que receber já começo.

Levi

If there are NO placeholders (all info is available), set placeholders to [] and info_request_message to null.`

export function buildClaudeCodeUserPrompt(
  lead: Lead,
  project: Project,
  reasonsText: string,
  scopeText: string,
  relevantMessages: string,
): string {
  return `Cliente: ${lead.business_name ?? 'Desconhecido'}
Site atual: ${lead.website ?? 'N/A'}
Tech stack detectada: ${lead.tech_stack ?? 'desconhecido'}
Problemas encontrados: ${reasonsText}
Escopo combinado:
- ${scopeText}
Valor combinado: R$ ${project.price ?? 0}

CONVERSA COMPLETA (use APENAS isso como base para o prompt — não invente nada além):
${relevantMessages || 'Nenhum dado de conversa disponível'}

IMPORTANTE: Gere o prompt baseado ESTRITAMENTE no que foi combinado acima. Se algo não foi discutido, NÃO inclua. Se faltam informações para executar, liste como placeholder.`
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
