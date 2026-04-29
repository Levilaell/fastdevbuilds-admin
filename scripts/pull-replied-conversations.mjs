// Pull every lead with at least one human reply + full conversation thread.
// Output is markdown-like so it can be read end-to-end.
//
// Usage:
//   node --env-file=.env.local scripts/pull-replied-conversations.mjs > /tmp/replied.md
//
// Used as the raw material for EXP_000_HISTORICAL_AUTOPSY.md — read manually,
// classify per conversation, then aggregate.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
)

const PHASE1_START = '2026-04-28T00:00:00Z'

const { data: leads, error: lErr } = await supabase
  .from('leads')
  .select('place_id, business_name, niche, country, city, status, outreach_sent_at, last_human_reply_at, last_inbound_at, last_outbound_at, last_auto_reply_at, opportunity_score, pain_score, review_count, rating, evolution_instance, outreach_channel')
  .not('last_human_reply_at', 'is', null)
  .order('outreach_sent_at', { ascending: true })

if (lErr) { console.error(lErr); process.exit(1) }

const placeIds = leads.map((l) => l.place_id)

const { data: conversations } = await supabase
  .from('conversations')
  .select('place_id, direction, channel, message, sent_at, suggested_by_ai, approved_by')
  .in('place_id', placeIds)
  .order('sent_at', { ascending: true })

const { data: projects } = await supabase
  .from('projects')
  .select('place_id, status, price, paid_at, preview_sent_at, created_at, claude_code_prompt, preview_url, notes')
  .in('place_id', placeIds)

const convByPlace = new Map()
for (const c of conversations ?? []) {
  if (!convByPlace.has(c.place_id)) convByPlace.set(c.place_id, [])
  convByPlace.get(c.place_id).push(c)
}
const projByPlace = new Map((projects ?? []).map((p) => [p.place_id, p]))

let count = 0
for (const lead of leads) {
  count++
  const project = projByPlace.get(lead.place_id)
  const convs = convByPlace.get(lead.place_id) || []
  const isPhase1 = lead.outreach_sent_at && lead.outreach_sent_at >= PHASE1_START

  const inbounds = convs.filter((c) => c.direction === 'in')
  const outbounds = convs.filter((c) => c.direction === 'out')
  const inboundTotalChars = inbounds.reduce((s, c) => s + (c.message?.length ?? 0), 0)
  const inboundTurns = inbounds.length
  const lastDir = convs.length > 0 ? convs[convs.length - 1].direction : 'none'

  console.log(`\n========================================`)
  console.log(`#${count}/${leads.length} ${isPhase1 ? '[FASE-1]' : '[PRE-FASE-1]'}`)
  console.log(`Business: ${lead.business_name || '(no name)'}`)
  console.log(`Niche: ${lead.niche || '?'}`)
  console.log(`Country/City: ${lead.country || '?'} / ${lead.city || '?'}`)
  console.log(`place_id: ${lead.place_id}`)
  console.log(`Status: lead=${lead.status}, project=${project?.status ?? 'no project'}`)
  if (project?.price) console.log(`Price set: R$ ${project.price}`)
  if (project?.paid_at) console.log(`PAID: ${project.paid_at}`)
  if (project?.notes) console.log(`Project notes: ${project.notes.slice(0, 200)}`)
  console.log(`Scoring: opportunity=${lead.opportunity_score}, pain=${lead.pain_score}, rating=${lead.rating}, reviews=${lead.review_count}`)
  console.log(`First send: ${lead.outreach_sent_at}`)
  console.log(`Last inbound (human): ${lead.last_human_reply_at}`)
  console.log(`Last outbound: ${lead.last_outbound_at}`)
  console.log(`Stats: inbound_turns=${inboundTurns}, inbound_chars=${inboundTotalChars}, outbound_turns=${outbounds.length}, last_msg_dir=${lastDir}`)
  console.log(``)
  console.log(`--- conversation ---`)

  for (const c of convs) {
    const dir = c.direction === 'in' ? '<<' : '>>'
    const ai = c.suggested_by_ai ? '[AI]' : ''
    const ts = c.sent_at ? c.sent_at.slice(0, 19).replace('T', ' ') : '?'
    const msg = (c.message ?? '(empty)').replace(/\r/g, '').slice(0, 1500)
    console.log(`${ts} ${dir} ${ai} ${msg}`)
  }
}

console.log(`\n\nTotal leads with human reply: ${leads.length}`)
