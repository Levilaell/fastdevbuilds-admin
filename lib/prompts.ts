import type { Lead, Project } from '@/lib/types'

// ─── Helpers used by prompt builders ───

/** Detect if a lead is from the US market. */
export function isUSLead(lead: Lead): boolean {
  return lead.country === 'US' || lead.outreach_channel === 'email'
}

/** Classify PageSpeed performance into qualitative levels. */
function perfLabel(mobileScore: number | null, lcp: number | null, lang: 'pt' | 'en' = 'pt'): string | null {
  if (lang === 'en') {
    if (mobileScore != null) {
      if (mobileScore < 30) return 'very poor performance'
      if (mobileScore < 50) return 'poor performance'
      if (mobileScore < 70) return 'average performance'
      return 'good performance'
    }
    if (lcp != null) {
      if (lcp > 6000) return 'very slow loading'
      if (lcp > 4000) return 'slow loading'
      if (lcp > 2500) return 'average loading'
      return 'fast loading'
    }
    return null
  }
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

function buildLeadContext(lead: Lead, reasonsText: string): string {
  const lang = isUSLead(lead) ? 'en' : 'pt'

  if (lang === 'en') {
    const lines = [
      `- Business: ${lead.business_name ?? 'Unknown'}`,
      `- City: ${lead.city ?? '—'}`,
      `- Website: ${lead.website ?? 'no website'}`,
      `- Tech stack: ${lead.tech_stack ?? '—'}`,
      `- Pain score: ${lead.pain_score ?? '—'}/10`,
      `- Detected problems: ${reasonsText || 'None'}`,
    ]
    const perf = perfLabel(lead.mobile_score, lead.lcp, 'en')
    if (perf) lines.push(`- PageSpeed (tested by Google): ${perf}`)
    if (lead.has_ssl === false) lines.push('- SSL: NO certificate (insecure site)')
    if (lead.is_mobile_friendly === false) lines.push('- Mobile: NOT optimized for mobile screens')
    if (lead.visual_score != null) lines.push(`- Visual score: ${lead.visual_score}/10`)
    if (lead.visual_notes) lines.push(`- Visual notes: ${lead.visual_notes}`)
    if (lead.scrape_failed) lines.push('- Site analysis: FAILED (site may be offline or blocking)')
    return lines.join('\n')
  }

  const lines = [
    `- Negócio: ${lead.business_name ?? 'Desconhecido'}`,
    `- Cidade: ${lead.city ?? '—'}`,
    `- Site: ${lead.website ?? 'sem site'}`,
    `- Tech stack: ${lead.tech_stack ?? '—'}`,
    `- Score de dor: ${lead.pain_score ?? '—'}/10`,
    `- Problemas detectados: ${reasonsText || 'Nenhum'}`,
  ]
  const perf = perfLabel(lead.mobile_score, lead.lcp)
  if (perf) lines.push(`- PageSpeed (testado pelo Google): ${perf}`)
  if (lead.has_ssl === false) lines.push('- SSL: NÃO tem (site inseguro)')
  if (lead.is_mobile_friendly === false) lines.push('- Mobile: NÃO é otimizado para celular')
  if (lead.visual_score != null) lines.push(`- Visual score: ${lead.visual_score}/10`)
  if (lead.visual_notes) lines.push(`- Visual notes: ${lead.visual_notes}`)
  if (lead.scrape_failed) lines.push('- Análise do site: FALHOU (site pode estar offline ou bloqueando)')
  return lines.join('\n')
}

// ─── 1. Suggestion prompt (reply-box "Sugerir com IA") ───

export function buildSuggestionSystemPrompt(
  lead: Lead,
  reasonsText: string,
  statusLabel: string,
): string {
  if (isUSLead(lead)) {
    return `You are Levi, a freelance developer at FastDevBuilds. You build websites, automations, and custom software for small businesses at accessible prices.

Lead context:
${buildLeadContext(lead, reasonsText)}
- Pipeline stage: ${statusLabel}

STRATEGY — for every reply:
1. Acknowledge what the lead said
2. Use ONE real problem from the analysis (when available)
3. Propose a simple, no-pressure next step

HOW TO RESPOND:

Timing objection ("not interested right now"):
→ Agree, reduce pressure, keep the door open

"We already have a site":
→ Validate, highlight a specific issue from the detected problems

Price question:
→ Don't give price yet — anchor value first, offer preview
→ Reinforce: "you only pay if you like the result"

Interest / asking for info:
→ Move forward with something concrete — 48h preview

Generic reply ("ok", "hi"):
→ Re-anchor context with a specific observation from the analysis

Rules:
- Max 2-3 short lines — text message length, not email
- Tone: professional but human — like a skilled freelancer, not a sales script
- ALWAYS reference ONE real detected problem when available
- NEVER suggest calls, meetings, or video calls — text/email only
- If price comes up: affordable pricing + "you only pay if you like the result"
- If NO technical data exists, ask what the lead needs — be curious, not salesy
- Services: websites, automations, custom software, internal tools, API integrations
- Sign as Levi`
  }

  return `Você é Levi, desenvolvedor freelancer da FastDevBuilds. Você faz sites, automações e software custom para pequenos negócios.

Contexto do lead:
${buildLeadContext(lead, reasonsText)}
- Estágio no pipeline: ${statusLabel}

ESTRATÉGIA — para cada resposta:
1. Reconheça o que o lead disse
2. Use UM problema real da análise (quando disponível)
3. Proponha um próximo passo simples e sem pressão

COMO RESPONDER:

Objeção de timing ("não tenho interesse agora"):
→ Concorde, reduza pressão, mantenha a porta aberta

"Já tenho site":
→ Valide, mostre uma oportunidade perdida dos problemas detectados

Pergunta sobre preço:
→ Não dê preço direto — ancore valor antes, ofereça preview
→ Reforce: "só paga se gostar"

Pedido de info / interesse:
→ Avance com algo concreto — preview em 48h

Resposta genérica ("ok", "oi"):
→ Re-ancore contexto com observação específica da análise

Regras:
- Máximo 2-3 linhas curtas — formato WhatsApp, não email
- Tom: informal, direto, pt-BR — como mensagem real, não script de vendas
- SEMPRE referência UM problema real detectado (quando existir)
- NÃO sugira calls, ligações, reuniões ou videochamadas
- Se falar de preço: "só paga se gostar" — vê o resultado antes de pagar, via PIX
- Se NÃO há dados técnicos, pergunte o que o lead precisa — seja curioso, não vendedor
- Assine como Levi`
}

export const SUGGESTION_USER_WITH_HISTORY = (history: string, lead?: Lead): string => {
  if (lead && isUSLead(lead)) {
    return `Conversation history:\n${history}\n\nSuggest the next message.`
  }
  return `Histórico da conversa:\n${history}\n\nSugira a próxima mensagem.`
}

export const SUGGESTION_USER_NO_HISTORY =
  'Ainda não houve conversa. Sugira a primeira mensagem de abordagem.'

// ─── 2. Classify & Suggest (webhook auto-analysis) ───

const PROPOSAL_SYSTEM_PROMPT_PT = `You are Levi, a freelance web developer (FastDevBuilds). Generate a project proposal in Brazilian Portuguese.

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

const PROPOSAL_SYSTEM_PROMPT_EN = `You are Levi, a freelance developer (FastDevBuilds). Generate a project proposal in English.

Services you can offer: websites, automations, custom software, dashboards, API integrations, internal tools — anything code-related.

Rules for the email message:
- Professional but warm tone in English
- NEVER mention specific payment processors
- NEVER suggest calls or meetings — email/text only
- Clearly state the satisfaction guarantee: "you only pay if you like the result"
- Pricing should be accessible and competitive
- Max 15 lines

Respond ONLY with valid JSON:
{
  "scope": ["item 1", "item 2", "item 3"],
  "timeline_days": 5,
  "price_usd": 500,
  "email_message": "full formatted email with scope, timeline, price and satisfaction guarantee, signed as Levi Laell / FastDevBuilds"
}`

export function getProposalSystemPrompt(lead: Lead): string {
  return isUSLead(lead) ? PROPOSAL_SYSTEM_PROMPT_EN : PROPOSAL_SYSTEM_PROMPT_PT
}

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

// ─── 4. Generate Claude Code Site Prompt ───

export const CLAUDE_CODE_SITE_SYSTEM_PROMPT = `You generate complete, production-ready implementation prompts for Claude Code to build professional websites that look agency-made — not generic templates.

Your output will be pasted DIRECTLY into Claude Code and executed without any manual editing. It must be 100% self-contained and richly detailed.

CRITICAL: Write everything in Portuguese (pt-BR).

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "prompt": "the complete Claude Code prompt following the exact structure below",
  "placeholders": ["item faltando 1", "item faltando 2"],
  "info_request_message": "WhatsApp message asking the client for missing info, or null if nothing is missing"
}

THE "prompt" FIELD MUST FOLLOW THIS EXACT STRUCTURE (include ALL sections, in this order):

---

## Briefing do cliente
[3-5 lines: who they are, what they do, their city, niche, Google rating/reviews if available. Write as if briefing a designer.]

## Site atual
[CHOOSE ONE:
- If client HAS a website: "O cliente tem o site {url}. ANTES DE CODAR: acesse o site, extraia a paleta de cores exata, os serviços listados, textos úteis e qualquer elemento visual que valha preservar ou melhorar. Use essas informações como base para o novo site."
- If client has NO website (no_website=true): "O cliente não tem site. O objetivo é criar o primeiro site profissional do negócio do zero."]

## Problemas detectados no site atual
[If the client has a site: describe the visual_score, visual_notes, pain_score, score_reasons, tech_stack, and PageSpeed data in plain language. This explains WHY the client needs a new site — frame it as context, not a bug report.
If no site: "Cliente sem site — não há análise técnica."]

## O que o cliente disse
[Include the relevant conversation messages provided. If the client mentioned specific services, colors, features, or preferences — mark them with ⚠️ PRIORIDADE and note they override any niche-based inference.]

## Escopo aprovado
[Bullet list of approved scope items. These are MANDATORY — every item must be implemented.]

## Stack obrigatória
- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Mobile-first obrigatório — pensar no celular antes de finalizar cada seção
- Tudo em um ÚNICO page.tsx com componentes inline (const ComponentName = () => ...) — sem arquivos separados de componentes
- next/font com Plus Jakarta Sans ou DM Sans
- Favicon via metadata com emoji relevante ao nicho (ex: 🦷 para dentista, 💇 para salão)
- Metadata SEO completa: title descritivo com nome do negócio + cidade, description de 150-160 caracteres

## Paleta de cores
[CHOOSE ONE:
- If client HAS a website: "Extrair a paleta real do site {url} e usar como base. Manter a identidade visual do cliente, modernizando o que for necessário."
- If client has NO website, select the palette that best matches their niche:

  Clínica / saúde / odontologia / psicologia / fisioterapia:
    Primária: #7C9885 (verde-sage) | Fundo: #F8F6F2 (off-white) | Accent: #C9A96E (dourado)

  Salão / beleza / estética / spa / sobrancelhas:
    Primária: #D4A5A5 (rosa nude) | Fundo: #F5EDE3 (bege) | Accent: #B8975A (dourado)

  Barbearia:
    Primária: #1A1A1A (preto) | Fundo: #2D2D2D (cinza escuro) | Accent: #C9A96E (dourado) | Texto: #F5F5F5

  Alimentação / confeitaria / restaurante / padaria:
    Primária: #E8845C (laranja) | Fundo: #FDF6EC (creme) | Accent: #6B4226 (marrom)

  Pet / veterinária / pet shop:
    Primária: #6BAE8E (verde) | Fundo: #F5E6C8 (amarelo suave) | Accent: #FFFFFF (branco)

  Outros / genérico:
    Primária: #2C5F6F (azul-petróleo) | Fundo: #F7F9FB (off-white) | Accent: #C9A96E (dourado)

Write the exact hex values chosen.]

## Seções obrigatórias (implementar TODAS, nesta ordem)

1. **Header fixo (sticky top-0 z-50 com backdrop-blur)**
   - Logo textual: nome do negócio em font-bold text-xl
   - Menu de navegação: links âncora para cada seção (Serviços, Diferenciais, Avaliações, Contato)
   - Botão "Agendar" à direita → abre WhatsApp
   - No mobile: menu hamburger com drawer

2. **Hero (min-h-screen flex items-center)**
   - Headline: focada em BENEFÍCIO para o cliente, NÃO no nome do negócio (ex: "Seu sorriso merece o melhor cuidado" em vez de "Bem-vindo à Clínica X")
   - Subtítulo: 1-2 linhas reforçando o diferencial
   - 2 botões: primário (WhatsApp, cor de destaque, grande) + secundário (scroll para serviços, outline)
   - Background: gradiente sutil usando as cores da paleta, ou imagem Unsplash relevante ao nicho com overlay escuro
   - O botão WhatsApp é o elemento MAIS VISÍVEL da seção

3. **Serviços (py-20)**
   - 4 a 6 cards em grid responsivo (1 col mobile, 2 col tablet, 3 col desktop)
   - Cada card: ícone SVG inline relevante + título do serviço + descrição de 1-2 linhas
   - Se o cliente listou serviços na conversa: usar EXATAMENTE esses
   - Se não listou: inferir os mais comuns do nicho
   - Cards com bg-white/bg-card, rounded-xl, shadow-md, hover:shadow-lg transition-all duration-300

4. **Diferenciais (py-20, fundo alternado)**
   - 3 itens em grid
   - Cada item: ícone SVG + título curto + descrição de 1-2 linhas
   - Inferir pelo nicho (ex: clínica → "Equipe Especializada", "Ambiente Acolhedor", "Tecnologia de Ponta")

5. **Avaliações (py-20)**
   - Badge do Google: ícone Google + rating real (ex: 4.8) + "X avaliações no Google" usando os dados reais do cliente
   - 3 depoimentos fictícios mas realistas: texto de 2-3 linhas + nome (inicial + sobrenome) + cidade real do negócio
   - Layout: cards ou carousel simples

6. **CTA final (py-16, fundo com cor de destaque da paleta)**
   - Título: "Agende sua consulta/visita/horário" (adaptar ao nicho)
   - Horários de funcionamento (placeholder se não informado)
   - Botão WhatsApp grande e visível — mesmo estilo do hero
   - Texto de reforço: "Atendemos pelo WhatsApp" ou similar

7. **Footer (py-12, fundo escuro)**
   - Nome do negócio
   - Endereço completo
   - Telefone clicável (tel:)
   - Ícones de redes sociais (Instagram, Facebook — links placeholder)
   - "© {ano} {nome}. Todos os direitos reservados."

## WhatsApp — regra inviolável
- TODOS os botões de ação ("Agendar", "Fale conosco", CTA) devem apontar para:
  https://wa.me/55{phone_digits_only}?text=Olá,%20gostaria%20de%20agendar
- {phone_digits_only} = telefone do cliente SEM formatação (apenas dígitos, sem +55, sem parênteses, sem traços)
- O telefone do cliente é fornecido nos dados — usar exatamente esse número

## Qualidade visual — padrão agência
- Design que parece feito por agência profissional — NÃO um template pronto
- Hierarquia visual clara: CTA principal (WhatsApp) é o elemento mais proeminente em hero e CTA final
- Cards com rounded-xl e shadow-md (hover:shadow-lg)
- Hover states em TODOS os elementos clicáveis: scale-[1.02], mudança de cor, ou shadow
- Transições suaves: transition-all duration-300
- Nenhuma seção vazia — se faltar dado real, usar placeholder coerente com o nicho
- Espaçamento generoso entre seções: py-20 mínimo
- Tipografia: títulos em font-bold com tracking-tight, corpo em text-gray-600 ou equivalente na paleta
- Ícones SVG inline — NÃO usar bibliotecas de ícones externas

## Como entregar
- Deploy na Vercel como preview primeiro
- URL de preview para o cliente aprovar antes do pagamento
- Só migrar domínio após aprovação e pagamento

## Meta de performance
- PageSpeed mobile > 90
- Imagens otimizadas (next/image quando aplicável)
- Sem dependências pesadas — tudo leve e rápido

## Ao finalizar
- Descrever o resultado visual de cada seção em 1 linha (ex: "Hero: gradiente verde-sage para branco, headline 'Seu sorriso merece o melhor cuidado', botão WhatsApp verde grande")
- Garantir que o site funciona completo com \`npm run dev\`

---

THE "info_request_message" (if needed) must be a WhatsApp message in this exact format:

{business_name}, para começar o seu projeto preciso de algumas informações:

[numbered list of missing items]

Pode me mandar isso? Assim que receber já começo.

Levi

If there are NO placeholders (all info is available), set placeholders to [] and info_request_message to null.`

export function buildClaudeCodeUserPrompt(
  lead: Lead,
  project: Project,
  reasonsText: string,
  scopeText: string,
  conversationHistory: string,
): string {
  const hasWebsite = Boolean(lead.website)
  const phoneDigits = (lead.phone ?? '').replace(/\D/g, '')

  const lines: string[] = [
    'DADOS DO CLIENTE:',
    `- Nome do negócio: ${lead.business_name ?? 'Desconhecido'}`,
    `- Nicho: ${lead.niche ?? 'não informado'}`,
    `- Cidade: ${lead.city ?? '—'}`,
    `- Endereço: ${lead.address ?? '—'}`,
    `- Telefone: ${lead.phone ?? 'não disponível'} (dígitos: ${phoneDigits})`,
    `- Google Rating: ${lead.rating ?? '—'} (${lead.review_count ?? 0} avaliações)`,
    `- Site atual: ${hasWebsite ? lead.website! : 'SEM SITE — criar o primeiro site do negócio'}`,
    `- País: ${lead.country ?? 'BR'}`,
    '',
  ]

  lines.push('ANÁLISE TÉCNICA DO SITE ATUAL:')
  if (hasWebsite) {
    lines.push(`- Tech stack atual: ${lead.tech_stack ?? 'desconhecido'} (NÃO replicar — o novo site será Next.js 15)`)
    lines.push(`- Pain score: ${lead.pain_score ?? '—'}/10`)
    lines.push(`- Problemas detectados: ${reasonsText || 'Nenhum'}`)
    if (lead.visual_score != null) lines.push(`- Visual score: ${lead.visual_score}/10`)
    if (lead.visual_notes?.length) {
      const notes = Array.isArray(lead.visual_notes) ? lead.visual_notes.join('; ') : lead.visual_notes
      lines.push(`- Notas visuais da IA: ${notes}`)
    }
    const perf = perfLabel(lead.mobile_score, lead.lcp)
    if (perf) lines.push(`- Performance mobile: ${perf}`)
    if (lead.mobile_score != null) lines.push(`- Mobile score: ${lead.mobile_score}/100`)
    if (lead.lcp != null) lines.push(`- LCP: ${lead.lcp}ms`)
    if (lead.has_ssl === false) lines.push('- SSL: NÃO tem (site inseguro)')
    if (lead.is_mobile_friendly === false) lines.push('- Mobile-friendly: NÃO')
  } else {
    lines.push('- Cliente sem site — não há análise técnica. Criar o primeiro site do zero.')
  }
  lines.push('')

  lines.push('HISTÓRICO DE CONVERSA (usar para entender o que o cliente quer):')
  lines.push(conversationHistory || 'Nenhuma conversa registrada.')
  lines.push('')

  lines.push('ESCOPO APROVADO (cada item é OBRIGATÓRIO):')
  lines.push(`- ${scopeText}`)
  lines.push('')

  lines.push('INSTRUÇÕES FINAIS:')
  lines.push('- Gere o prompt completo seguindo TODAS as seções do system prompt.')
  lines.push('- Se o cliente mencionou serviços, cores ou preferências na conversa → PRIORIDADE sobre inferência por nicho.')
  lines.push('- Se informação estiver faltando para executar, liste como placeholder e gere a info_request_message.')
  lines.push('- O prompt final deve ser colável diretamente no Claude Code sem edição.')

  return lines.join('\n')
}

// ─── 5. PIX Message ───

