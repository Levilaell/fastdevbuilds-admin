// Top-of-funnel audit. Cross-tabs lead attributes vs real outcomes:
//   NO_REPLY → BOT_ONLY → HUMAN_REACHED → PRICE_DISCUSSED
//
// PRICE_DISCUSSED is the high-intent cohort identified manually in
// EXP_000_HISTORICAL_AUTOPSY.md §2 — 8 place_ids hardcoded below.
//
// Usage:
//   node --env-file=.env.local scripts/audit-top-of-funnel.mjs

import { createClient } from '@supabase/supabase-js'

const PHASE1_START = '2026-04-28T00:00:00Z'

// 8 place_ids that reached price discussion (manual classification, EXP-000 §2).
const PRICE_REACHED_PIDS = new Set([
  'ChIJw4Zokl5XzJQRaBGCmS4q1kA', // Studio Julia Graziela (salões) — R$1200 quoted
  'ChIJb10yxqj5zJQRVxp0NBZP7U0', // Matheus Sabatino (nutri) — R$1200 cartão
  'ChIJIWSmtPzJyJQRxc2XC7u8U2g', // Espaço Fluir (salões) — asked call, then receptionist
  'ChIJKRVsZtppzpQRdC9MA0XBHss', // Giba's Gym (academias) — R$997 quoted
  'ChIJY7pmZwj_zpQR-_kO0DNgGyU', // Bonitas Boutique (roupas) — asked price
  'ChIJ5yHSyLj_zpQRtfChcQ-F0hU', // Hadassa Flores (flori) — R$1200, declined
  'ChIJp_a2J_5fz5QRD6BvIqLZufQ', // EVOLUA Fisioterapia (fisio) — R$997 quoted
  'ChIJl-48KtmKxZQRguaWyWBumPI', // Rafaela Flores (flori) — asked price, offer drift
])

// Bot-only (auto-replies, no real human ever reached) — manual classification.
const BOT_ONLY_PIDS = new Set([
  'ChIJc_mwIAL5zJQRTFF6MSms3II', // Hugle (AI assistant)
  'ChIJ4UUOoVv5zJQROiMWjz03UYs', // Plano Contábil (IVR)
  'ChIJnVP8FgchzpQR73lbLkZgeoM', // Amigos Veterinária (AI)
  'ChIJhYLlIkPPyJQRm5LRrAqAGsY', // Dra Thainá (greeting bot)
  'ChIJ0etQf9PFyJQRGRkGNYRSDIo', // Barber and Coffee (greeting bot)
  'ChIJ7XgP82l-ISgR3429Sek-bps', // Erika Saraiva (intake bot)
  'ChIJ6SrcsKvFyJQRO9YsuMCP8ig', // Sara Nicola Floricultura (catalog bot)
  'ChIJxUvmq3FDzpQRcRb96vLrysc', // Dra Adrielli Costa (auto-replies)
  'ChIJnZ4u3wT_zpQR9pEv0YZIQgg', // Auto Escola Viena (greeting bot)
  'ChIJo_ovk2v_zpQR0lCIDY-roRQ', // English Is Fun (auto)
  'ChIJJ8mivOmLxZQRC_Pynevq63w', // Allini Perissini (intake bot)
  'ChIJr7J5Cihhz5QRmbA9hlc0W-g', // Anally Britto Floricultura (catalog bot)
  'ChIJsZPmkttFzpQRZRUrl4J--Js', // Cris Viana Estética (signature only)
])

// Receptionist (clearly intercepted by staff, owner unreachable).
const RECEPTIONIST_PIDS = new Set([
  'ChIJx6QeMQa_uZQRtaTR6WHSPq8', // Confeitaria Ponto Nick
  'ChIJb9Mxkk7PyJQRPOy3IwAXgwY', // Salão Unike (passada pra Fabio)
  'ChIJh8mScE3PyJQRNPiyL2Cm3Kk', // George Cabeleireiros (entre em contato c/ outro número)
  'ChIJjWHK6N_FyJQRUhakjXijF5E', // Super Linda (passei pro setor)
  'ChIJV60COJr_zpQRrePbE16XH1c', // Croma Burguers (responsável compras)
  'ChIJL2JZ2CL_zpQRkXVrPFn2PPU', // Tekka (Lavínia equipe)
  'ChIJyVb6tKVhz5QRApIs_Ls6Arc', // Iris Confeitaria (Adriana atendimento)
  'ChIJYaynZA7_zpQRR_Hu6CVonFw', // Castelo Branco
])

// Cross-talk / data corruption (US WhatsApp attribution bugs).
const NOISE_PIDS = new Set([
  'ChIJkcaMfo1YXIYRr0qcoBbtGhU', // Esparza's Appliances (cross-talk c/ família)
  'ChIJQ9RkomUlTIYRJ1DHC64LN8g', // London's Pinpoint (cross-talk entre leads)
  'unknown_5513996515410',         // Felps (personal)
])

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
)

function pct(num, den) {
  if (!den) return '—'
  return `${((num / den) * 100).toFixed(1)}%`
}

function table(rows, headers) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)))
  const fmt = (cells) => '| ' + cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join(' | ') + ' |'
  const sep = '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|'
  return [fmt(headers), sep, ...rows.map((r) => fmt(r))].join('\n')
}

async function fetchAllSentLeads() {
  const all = []
  let from = 0
  const pageSize = 1000
  for (;;) {
    const { data, error } = await supabase
      .from('leads')
      .select(
        'place_id, business_name, niche, country, city, address, status, outreach_sent_at, last_human_reply_at, opportunity_score, pain_score, score_reasons, review_count, rating, website, has_ssl, has_pixel, has_analytics, has_whatsapp, has_form, has_booking, perf_score, mobile_score, tech_stack, visual_score, evolution_instance',
      )
      .eq('outreach_sent', true)
      .not('outreach_sent_at', 'is', null)
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

function classify(lead) {
  if (NOISE_PIDS.has(lead.place_id)) return 'NOISE'
  if (PRICE_REACHED_PIDS.has(lead.place_id)) return 'PRICE_REACHED'
  if (RECEPTIONIST_PIDS.has(lead.place_id)) return 'RECEPTIONIST'
  if (BOT_ONLY_PIDS.has(lead.place_id)) return 'BOT_ONLY'
  if (lead.last_human_reply_at) return 'HUMAN_LOW' // replied but didn't reach price/receptionist/bot
  return 'NO_REPLY'
}

function reviewBucket(n) {
  if (n == null) return '(null)'
  if (n < 10) return '00. <10'
  if (n < 30) return '01. 10-29'
  if (n < 100) return '02. 30-99'
  if (n < 300) return '03. 100-299'
  if (n < 1000) return '04. 300-999'
  return '05. 1000+'
}

function ratingBucket(r) {
  if (r == null) return '(null)'
  if (r < 4.0) return '<4.0'
  if (r < 4.5) return '4.0-4.4'
  if (r < 4.8) return '4.5-4.7'
  if (r < 5.0) return '4.8-4.9'
  return '5.0'
}

function oppBucket(s) {
  if (s == null) return '(null)'
  if (s <= 1) return '0-1'
  if (s <= 3) return '2-3'
  return '4-5'
}

function painBucket(s) {
  if (s == null) return '(null)'
  if (s <= 3) return '0-3'
  if (s <= 7) return '4-7'
  return '8-10'
}

function crossTab(leads, keyFn) {
  const map = new Map()
  for (const l of leads) {
    const k = keyFn(l)
    if (!map.has(k)) map.set(k, { sent: 0, replied: 0, price: 0 })
    const row = map.get(k)
    row.sent++
    const cls = classify(l)
    if (cls === 'PRICE_REACHED') {
      row.price++
      row.replied++
    } else if (cls === 'HUMAN_LOW' || cls === 'RECEPTIONIST') {
      row.replied++
    } else if (cls === 'BOT_ONLY') {
      // bot reply doesn't count as real reply
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, r]) => [k, r.sent, r.replied, r.price, pct(r.replied, r.sent), pct(r.price, r.sent)])
}

async function main() {
  const leads = await fetchAllSentLeads()
  const preFase1 = leads.filter((l) => l.outreach_sent_at < PHASE1_START)
  const fase1 = leads.filter((l) => l.outreach_sent_at >= PHASE1_START)

  console.log('# Top-of-funnel cross-tabs\n')
  console.log(`Cohort: ${preFase1.length} pré-Fase-1 envios + ${fase1.length} Fase-1 envios.`)
  console.log(`Total ${leads.length}. Análise abaixo é PRÉ-FASE-1 only (cohort com tempo de funil suficiente).`)
  console.log('')
  console.log(`Buckets manualmente identificados:`)
  console.log(`- PRICE_REACHED: ${PRICE_REACHED_PIDS.size} place_ids`)
  console.log(`- RECEPTIONIST: ${RECEPTIONIST_PIDS.size}`)
  console.log(`- BOT_ONLY: ${BOT_ONLY_PIDS.size}`)
  console.log(`- NOISE: ${NOISE_PIDS.size}`)
  console.log('')

  console.log('## Distribuição de outcomes (pré-Fase-1)\n')
  const counts = { NO_REPLY: 0, BOT_ONLY: 0, RECEPTIONIST: 0, HUMAN_LOW: 0, PRICE_REACHED: 0, NOISE: 0 }
  for (const l of preFase1) counts[classify(l)]++
  for (const k of Object.keys(counts)) {
    console.log(`- ${k}: ${counts[k]} (${pct(counts[k], preFase1.length)})`)
  }
  console.log('')

  console.log('## Cross-tab: review_count vs outcome\n')
  console.log(table(
    crossTab(preFase1, (l) => reviewBucket(l.review_count)),
    ['bucket', 'sent', 'real_reply', 'price', 'reply_rate', 'price_rate'],
  ))
  console.log('')

  console.log('## Cross-tab: rating vs outcome\n')
  console.log(table(
    crossTab(preFase1, (l) => ratingBucket(l.rating)),
    ['bucket', 'sent', 'real_reply', 'price', 'reply_rate', 'price_rate'],
  ))
  console.log('')

  console.log('## Cross-tab: opportunity_score vs outcome\n')
  console.log(table(
    crossTab(preFase1, (l) => oppBucket(l.opportunity_score)),
    ['bucket', 'sent', 'real_reply', 'price', 'reply_rate', 'price_rate'],
  ))
  console.log('')

  console.log('## Cross-tab: pain_score vs outcome\n')
  console.log(table(
    crossTab(preFase1, (l) => painBucket(l.pain_score)),
    ['bucket', 'sent', 'real_reply', 'price', 'reply_rate', 'price_rate'],
  ))
  console.log('')

  console.log('## Cross-tab: has_website vs outcome\n')
  console.log(table(
    crossTab(preFase1, (l) => (l.website ? 'has_site' : 'no_site')),
    ['bucket', 'sent', 'real_reply', 'price', 'reply_rate', 'price_rate'],
  ))
  console.log('')

  console.log('## Cross-tab: niche vs outcome (top 15 por sent)\n')
  const byNicheRows = crossTab(preFase1, (l) => l.niche || '(null)')
  byNicheRows.sort((a, b) => b[1] - a[1])
  console.log(table(byNicheRows.slice(0, 15), ['niche', 'sent', 'real_reply', 'price', 'reply_rate', 'price_rate']))
  console.log('')

  console.log('## Cross-tab: country vs outcome\n')
  console.log(table(
    crossTab(preFase1, (l) => l.country || '(null)'),
    ['country', 'sent', 'real_reply', 'price', 'reply_rate', 'price_rate'],
  ))
  console.log('')

  console.log('## Profile dos 8 PRICE_REACHED (atributos individuais)\n')
  const priceLeads = preFase1.filter((l) => PRICE_REACHED_PIDS.has(l.place_id))
  const profileTbl = priceLeads.map((l) => [
    (l.business_name || '?').slice(0, 26),
    l.niche || '?',
    l.review_count ?? '?',
    l.rating ?? '?',
    l.opportunity_score ?? '?',
    l.pain_score ?? '?',
    l.website ? 'sim' : 'não',
    l.tech_stack || '?',
  ])
  console.log(table(profileTbl, ['business', 'niche', 'reviews', 'rating', 'opp', 'pain', 'site', 'stack']))
  console.log('')

  console.log('## Profile dos 13 BOT_ONLY (atributos individuais)\n')
  const botLeads = preFase1.filter((l) => BOT_ONLY_PIDS.has(l.place_id))
  const botTbl = botLeads.map((l) => [
    (l.business_name || '?').slice(0, 26),
    l.niche || '?',
    l.review_count ?? '?',
    l.rating ?? '?',
    l.opportunity_score ?? '?',
    l.website ? 'sim' : 'não',
  ])
  console.log(table(botTbl, ['business', 'niche', 'reviews', 'rating', 'opp', 'site']))
  console.log('')

  console.log('## Profile dos 8 RECEPTIONIST (atributos individuais)\n')
  const recLeads = preFase1.filter((l) => RECEPTIONIST_PIDS.has(l.place_id))
  const recTbl = recLeads.map((l) => [
    (l.business_name || '?').slice(0, 26),
    l.niche || '?',
    l.review_count ?? '?',
    l.rating ?? '?',
    l.opportunity_score ?? '?',
    l.website ? 'sim' : 'não',
  ])
  console.log(table(recTbl, ['business', 'niche', 'reviews', 'rating', 'opp', 'site']))
  console.log('')

  console.log('## Comparação direta: PRICE_REACHED vs BOT_ONLY vs RECEPTIONIST (médias)\n')
  function avg(arr, key) {
    const xs = arr.map((l) => l[key]).filter((v) => v != null)
    if (!xs.length) return '—'
    return (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1)
  }
  function median(arr, key) {
    const xs = arr.map((l) => l[key]).filter((v) => v != null).sort((a, b) => a - b)
    if (!xs.length) return '—'
    const m = Math.floor(xs.length / 2)
    return xs.length % 2 ? xs[m] : ((xs[m - 1] + xs[m]) / 2).toFixed(1)
  }
  function pctSite(arr) {
    const has = arr.filter((l) => l.website).length
    return pct(has, arr.length)
  }
  console.log(table(
    [
      ['n', priceLeads.length, botLeads.length, recLeads.length],
      ['median review_count', median(priceLeads, 'review_count'), median(botLeads, 'review_count'), median(recLeads, 'review_count')],
      ['avg rating', avg(priceLeads, 'rating'), avg(botLeads, 'rating'), avg(recLeads, 'rating')],
      ['avg opportunity_score', avg(priceLeads, 'opportunity_score'), avg(botLeads, 'opportunity_score'), avg(recLeads, 'opportunity_score')],
      ['avg pain_score', avg(priceLeads, 'pain_score'), avg(botLeads, 'pain_score'), avg(recLeads, 'pain_score')],
      ['% has_website', pctSite(priceLeads), pctSite(botLeads), pctSite(recLeads)],
    ],
    ['attribute', 'PRICE_REACHED', 'BOT_ONLY', 'RECEPTIONIST'],
  ))
  console.log('')

  console.log('## Niche × review_count (PRE-FASE-1, só mostrando combos com sent ≥ 10)\n')
  const nicheReview = new Map()
  for (const l of preFase1) {
    const k = `${l.niche || '?'} / ${reviewBucket(l.review_count)}`
    if (!nicheReview.has(k)) nicheReview.set(k, { sent: 0, replied: 0, price: 0 })
    const row = nicheReview.get(k)
    row.sent++
    const cls = classify(l)
    if (cls === 'PRICE_REACHED') { row.price++; row.replied++ }
    else if (cls === 'HUMAN_LOW' || cls === 'RECEPTIONIST') row.replied++
  }
  const nrRows = [...nicheReview.entries()]
    .filter(([_, r]) => r.sent >= 10)
    .map(([k, r]) => [k, r.sent, r.replied, r.price, pct(r.replied, r.sent), pct(r.price, r.sent)])
    .sort((a, b) => b[1] - a[1])
  console.log(table(nrRows, ['niche / reviews', 'sent', 'real_reply', 'price', 'reply_rate', 'price_rate']))
  console.log('')

  console.log('## City top 20 com sent ≥ 5\n')
  const byCity = new Map()
  for (const l of preFase1) {
    const k = l.city || '?'
    if (!byCity.has(k)) byCity.set(k, { sent: 0, replied: 0, price: 0 })
    const row = byCity.get(k)
    row.sent++
    const cls = classify(l)
    if (cls === 'PRICE_REACHED') { row.price++; row.replied++ }
    else if (cls === 'HUMAN_LOW' || cls === 'RECEPTIONIST') row.replied++
  }
  const cityRows = [...byCity.entries()]
    .filter(([_, r]) => r.sent >= 5)
    .map(([k, r]) => [k.slice(0, 30), r.sent, r.replied, r.price, pct(r.replied, r.sent), pct(r.price, r.sent)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
  console.log(table(cityRows, ['city', 'sent', 'real_reply', 'price', 'reply_rate', 'price_rate']))
  console.log('')
}

main().catch((e) => { console.error(e); process.exit(1) })
