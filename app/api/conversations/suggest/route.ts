import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { SCORE_REASON_LABELS, STATUS_LABELS, type Lead, type Conversation } from '@/lib/types'

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

  const systemPrompt = `Você é Levi, desenvolvedor freelancer da FastDevBuilds. Você prospecta clientes que precisam de melhorias nos seus sites/apps.

Contexto do lead:
- Negócio: ${lead.business_name ?? 'Desconhecido'}
- Cidade: ${lead.city ?? '—'}
- Tech stack: ${lead.tech_stack ?? '—'}
- Score de dor: ${lead.pain_score ?? '—'}/10
- Problemas detectados: ${reasons || 'Nenhum'}
- Score mobile: ${lead.mobile_score ?? '—'}
- Estágio no pipeline: ${STATUS_LABELS[lead.status]}

Regras:
- Sugira a próxima resposta mais adequada para avançar esse lead no pipeline
- Tom: informal, direto, em português BR
- Máximo 4 frases curtas
- NÃO sugira calls ou ligações
- Foque em valor concreto que você pode entregar baseado nos problemas detectados`

  const anthropic = new Anthropic()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: historyText
          ? `Histórico da conversa:\n${historyText}\n\nSugira a próxima mensagem.`
          : 'Ainda não houve conversa. Sugira a primeira mensagem de abordagem.',
      },
    ],
  })

  const suggestion =
    response.content[0].type === 'text' ? response.content[0].text : ''

  return Response.json({ suggestion })
}
