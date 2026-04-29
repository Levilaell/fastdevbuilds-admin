// Read-only audit. Runs N targeted queries and prints sections that are
// pasted as-is into GTM_DIAGNOSIS.md. No writes, no migrations.
//
// Usage:
//   node --env-file=.env.local scripts/audit-data.mjs
//
// Phase 1 = BR-WA-PREVIEW launch on 2026-04-28 (per docs/PLAYBOOK.md).
// Anything before that is the old funnel and is reported separately.

import { createClient } from '@supabase/supabase-js'

const PHASE1_START = '2026-04-28T00:00:00Z'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
)

function pct(num, den) {
  if (!den) return '—'
  return `${((num / den) * 100).toFixed(1)}%`
}

function countBy(rows, key) {
  const m = new Map()
  for (const r of rows) {
    const v = r[key] ?? '(null)'
    m.set(v, (m.get(v) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function table(rows, headers) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)))
  const fmt = (cells) => '| ' + cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join(' | ') + ' |'
  const sep = '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|'
  return [fmt(headers), sep, ...rows.map((r) => fmt(r))].join('\n')
}

async function fetchAllLeads() {
  const all = []
  let from = 0
  const pageSize = 1000
  for (;;) {
    const { data, error } = await supabase
      .from('leads')
      .select(
        'place_id, country, status, niche, city, outreach_sent, outreach_sent_at, outreach_channel, evolution_instance, last_human_reply_at, last_inbound_at, last_outbound_at, website, rating, review_count, opportunity_score, pain_score',
      )
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function fetchAllProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('place_id, status, price, paid_at, created_at, claude_code_prompt, preview_url, preview_sent_at')
  if (error) throw error
  return data ?? []
}

async function fetchPreviewViews() {
  const { data, error } = await supabase.from('preview_views').select('place_id, viewed_at')
  if (error) throw error
  return data ?? []
}

async function fetchConversationStats() {
  const { count: inboundCount } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'in')
  const { count: outboundCount } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'out')
  return { inboundCount: inboundCount ?? 0, outboundCount: outboundCount ?? 0 }
}

async function fetchQuarantineCount() {
  const { count } = await supabase
    .from('webhook_inbound_quarantine')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false)
  return count ?? 0
}

async function main() {
  const [leads, projects, previewViews, convStats, quarantine] = await Promise.all([
    fetchAllLeads(),
    fetchAllProjects(),
    fetchPreviewViews(),
    fetchConversationStats(),
    fetchQuarantineCount(),
  ])

  const projByPlace = new Map(projects.map((p) => [p.place_id, p]))
  const openedSet = new Set(previewViews.map((v) => v.place_id))

  const sentLeads = leads.filter((l) => l.outreach_sent === true && l.outreach_sent_at)
  const phase1Leads = sentLeads.filter((l) => l.outreach_sent_at >= PHASE1_START)
  const oldLeads = sentLeads.filter((l) => l.outreach_sent_at < PHASE1_START)

  function funnel(cohort, label) {
    const sent = cohort.length
    const replied = cohort.filter((l) => l.last_human_reply_at).length
    const accepted = cohort.filter((l) => {
      const p = projByPlace.get(l.place_id)
      return p && (p.status === 'approved' || p.status === 'preview_sent' || p.status === 'adjusting' || p.status === 'delivered' || p.status === 'paid')
    }).length
    const previewSent = cohort.filter((l) => {
      const p = projByPlace.get(l.place_id)
      return p && (p.status === 'preview_sent' || p.status === 'adjusting' || p.status === 'delivered' || p.status === 'paid')
    }).length
    const previewOpened = cohort.filter((l) => openedSet.has(l.place_id)).length
    const paid = cohort.filter((l) => projByPlace.get(l.place_id)?.status === 'paid').length

    return { label, sent, replied, accepted, previewSent, previewOpened, paid }
  }

  const fOld = funnel(oldLeads, 'Pré-Fase-1 (< 2026-04-28)')
  const fPhase1 = funnel(phase1Leads, `Fase 1 (≥ ${PHASE1_START.slice(0, 10)})`)
  const fAll = funnel(sentLeads, 'Tudo')

  // Phase 1 projects: created_at >= PHASE1_START
  const phase1Projects = projects.filter((p) => p.created_at && p.created_at >= PHASE1_START)
  const phase1PreviewsGenerated = phase1Projects.filter((p) => !!p.claude_code_prompt).length

  // Output sections — markdown
  const out = []
  out.push('## Inventário de dados (snapshot agora)\n')
  out.push(`- Total de leads na tabela: **${leads.length}**`)
  out.push(`- Leads com outreach enviado (outreach_sent=true e timestamp): **${sentLeads.length}**`)
  out.push(`- Conversas inbound: **${convStats.inboundCount}**`)
  out.push(`- Conversas outbound: **${convStats.outboundCount}**`)
  out.push(`- Preview opens registrados (preview_views): **${previewViews.length}** linhas, **${openedSet.size}** place_ids distintos`)
  out.push(`- Projects total: **${projects.length}**, com claude_code_prompt: **${projects.filter((p) => p.claude_code_prompt).length}**, com preview_url: **${projects.filter((p) => p.preview_url).length}**`)
  out.push(`- Quarantine (inbounds sem match): **${quarantine}** não resolvidos`)
  out.push('')

  out.push('## Distribuição da base de leads\n')
  out.push('### Por country')
  out.push(table(countBy(leads, 'country').map(([k, n]) => [k, n]), ['country', 'leads']))
  out.push('\n### Por status')
  out.push(table(countBy(leads, 'status').map(([k, n]) => [k, n]), ['status', 'leads']))
  out.push('\n### Por outreach_channel (apenas leads com outreach_sent)')
  out.push(table(countBy(sentLeads, 'outreach_channel').map(([k, n]) => [k, n]), ['channel', 'leads']))
  out.push('\n### Top 15 niches (todos os leads)')
  out.push(table(countBy(leads, 'niche').slice(0, 15).map(([k, n]) => [k, n]), ['niche', 'leads']))
  out.push('\n### Top 15 cidades (apenas leads com outreach enviado)')
  out.push(table(countBy(sentLeads, 'city').slice(0, 15).map(([k, n]) => [k, n]), ['city', 'leads']))
  out.push('')

  out.push('## Funil — split por era\n')
  out.push('A Fase 1 (BR-WA-PREVIEW, R$ 997 fixo, clínicas estética) lançou em 2026-04-28 conforme `docs/PLAYBOOK.md`. Tudo antes disso é o modelo antigo e tem que ser lido como post-mortem, não como diagnóstico do produto atual.\n')
  for (const f of [fOld, fPhase1, fAll]) {
    out.push(`### ${f.label}`)
    out.push(table(
      [
        ['enviado', f.sent, '100%'],
        ['respondeu (last_human_reply_at != null)', f.replied, pct(f.replied, f.sent)],
        ['aceitou preview (project ≥ approved)', f.accepted, pct(f.accepted, f.sent)],
        ['preview enviado (project ≥ preview_sent)', f.previewSent, pct(f.previewSent, f.sent)],
        ['preview aberto (beacon hit)', f.previewOpened, pct(f.previewOpened, f.sent)],
        ['pago', f.paid, pct(f.paid, f.sent)],
      ],
      ['estágio', '#', '% do cohort'],
    ))
    out.push('')
  }

  out.push('## Fase 1 — estado de Dia 0 (kill switch em 14 dias / 100 msgs)\n')
  out.push(`- Leads com outreach enviado **dentro da Fase 1**: **${phase1Leads.length}**`)
  out.push(`- Projects criados na Fase 1: **${phase1Projects.length}**`)
  out.push(`- Previews gerados na Fase 1 (claude_code_prompt populado): **${phase1PreviewsGenerated}**`)
  out.push(`- Reply rate Fase 1: **${pct(fPhase1.replied, fPhase1.sent)}**`)
  out.push(`- Preview open rate Fase 1: **${pct(fPhase1.previewOpened, fPhase1.previewSent)}**`)
  out.push(`- Vendas Fase 1: **${fPhase1.paid}**`)
  out.push('')

  // Old-funnel niche cut
  out.push('## Pré-Fase-1: response rate por niche (post-mortem)\n')
  const byNiche = new Map()
  for (const l of oldLeads) {
    const k = l.niche?.trim() || '(null)'
    if (!byNiche.has(k)) byNiche.set(k, { sent: 0, replied: 0 })
    const row = byNiche.get(k)
    row.sent++
    if (l.last_human_reply_at) row.replied++
  }
  const nicheRows = [...byNiche.entries()]
    .map(([n, r]) => [n, r.sent, r.replied, pct(r.replied, r.sent)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
  out.push(table(nicheRows, ['niche', 'sent', 'replied', 'reply_rate']))
  out.push('')

  out.push('## Pré-Fase-1: response rate por country/channel (post-mortem)\n')
  const byCountryChannel = new Map()
  for (const l of oldLeads) {
    const k = `${l.country ?? '(null)'} / ${l.outreach_channel ?? '(null)'}`
    if (!byCountryChannel.has(k)) byCountryChannel.set(k, { sent: 0, replied: 0 })
    const row = byCountryChannel.get(k)
    row.sent++
    if (l.last_human_reply_at) row.replied++
  }
  const ccRows = [...byCountryChannel.entries()]
    .map(([k, r]) => [k, r.sent, r.replied, pct(r.replied, r.sent)])
    .sort((a, b) => b[1] - a[1])
  out.push(table(ccRows, ['country / channel', 'sent', 'replied', 'reply_rate']))
  out.push('')

  out.push('## Sinais não medidos (gaps)\n')
  out.push('Campos que o user pediu mas que NÃO existem na schema atual ou nunca foram populados:')
  out.push('- `outreach_variant` — não existe. Sem isso, A/B teste é impossível medir.')
  out.push('- `lead_temperature` (HOT/WARM/COLD) — não existe; pode ser derivado de SQL contra opportunity_score + reviews + rating.')
  out.push('- `instagram_url`, `instagram_followers` — não coletados.')
  out.push('- `whatsapp_business_detected` — não medido.')
  out.push('- `decision_maker_detected` / `contact_role` — não medido (todo lead é tratado como dono).')
  out.push('- `lost_reason` — não há coluna; status `lost` é flag binária.')
  out.push('- `preview_first_view_at` está derivado em código (LeadCard) mas não persistido em leads.')
  out.push('')

  out.push('## Numbers de referência (sanity vs claim do user)\n')
  out.push('User declarou: 500 BR offer-first + 20 BR preview-first + 50 US preview-first = 570 envios.')
  out.push(`Banco mostra: ${sentLeads.length} envios totais (todas as eras).`)
  out.push(`Pré-Fase-1: ${oldLeads.length} envios. Fase 1: ${phase1Leads.length}.`)
  out.push('')

  console.log(out.join('\n'))
}

main().catch((e) => {
  console.error('Audit failed:', e)
  process.exit(1)
})
