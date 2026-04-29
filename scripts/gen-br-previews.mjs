import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
)

// BR-WA-PREVIEW leads: country=BR + whatsapp + preview-first (project has claude_code_prompt)
const { data: projects, error } = await supabase
  .from('projects')
  .select('place_id, claude_code_prompt, preview_url, created_at, status')
  .eq('status', 'approved')
  .not('claude_code_prompt', 'is', null)
  .order('created_at', { ascending: false })

if (error) { console.error(error); process.exit(1) }

const placeIds = projects.map(p => p.place_id)
const { data: leads, error: lErr } = await supabase
  .from('leads')
  .select('place_id, business_name, city, country, outreach_channel')
  .in('place_id', placeIds)
  .eq('country', 'BR')

if (lErr) { console.error(lErr); process.exit(1) }

const leadById = new Map(leads.map(l => [l.place_id, l]))
const candidates = projects
  .filter(p => leadById.has(p.place_id))
  .map(p => ({ ...p, lead: leadById.get(p.place_id) }))

console.log(`Found ${candidates.length} BR-WA-PREVIEW candidates`)

function slugify(s) {
  const STOP = new Set(['de','da','do','das','dos','e','em','para','sa','ltda','clinica','estetica','clinic','sorocaba','sp','brasil','dra','dr','expert','avancada','saude','beauty'])
  const ascii = (s || 'unnamed').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  // Try head first (before |, (, ' - '); if too thin, use full string
  const head = ascii.split(/[|(]/)[0].split(' - ')[0]
  const tokenize = (str) => str.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  let tokens = tokenize(head).filter(t => !STOP.has(t))
  if (tokens.length < 2) tokens = tokenize(ascii).filter(t => !STOP.has(t))
  if (tokens.length === 0) tokens = tokenize(ascii)
  const slug = tokens.slice(0, 3).join('-').slice(0, 28).replace(/-+$/, '')
  return slug || 'unnamed'
}

const baseDir = '/home/levilaell/previews'
const usedSlugs = new Set()
const lines = []
lines.push('# Comandos pra rodar cada preview BR-WA-PREVIEW localmente')
lines.push('# Executa um por vez — cada claude -p roda 5-10min.')
lines.push('# Depois de cada, pega URL do final do stdout e cola no admin.')
lines.push('')

function folderHasGeneratedSite(dir) {
  // A "fresh" folder has only prompt.txt (or nothing). A used one has package.json, app/, etc.
  if (!existsSync(dir)) return false
  const entries = readdirSync(dir).filter(e => e !== 'prompt.txt')
  return entries.length > 0
}

const top = candidates.slice(0, 10)
top.forEach((p, i) => {
  const baseSlug = slugify(p.lead.business_name)
  let slug = baseSlug
  let n = 2
  // Skip slugs already used in this run, AND slugs that already have a generated site.
  // Falling back to suffixed slug avoids clobbering prior runs.
  while (usedSlugs.has(slug) || folderHasGeneratedSite(join(baseDir, slug))) {
    slug = `${baseSlug}-${n++}`
  }
  usedSlugs.add(slug)

  const dir = join(baseDir, slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'prompt.txt'), p.claude_code_prompt)

  lines.push(`# ─── ${i + 1}/${top.length}  [BR] ${p.lead.business_name}  (${p.claude_code_prompt.length} chars)  place_id=${p.place_id}`)
  lines.push(`cd ${dir}`)
  lines.push(`claude -p "$(cat prompt.txt)" --dangerously-skip-permissions`)
  lines.push('')
})

writeFileSync(join(baseDir, 'RUN-br-batch.txt'), lines.join('\n'))
console.log(`\nWrote ${top.length} folders + RUN-br-batch.txt`)
top.forEach((p, i) => console.log(`  ${i+1}. ${p.lead.business_name} → ${slugify(p.lead.business_name)}`))
