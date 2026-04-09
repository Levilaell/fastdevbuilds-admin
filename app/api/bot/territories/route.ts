import { createClient } from '@/lib/supabase/server'
import { extractCity } from '@/lib/extract-city'

export interface Territory {
  niche: string
  city: string
  lead_count: number
  last_run_at: string | null
}

export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('leads')
    .select('niche, address, status_updated_at')
    .not('niche', 'eq', 'inbound')
    .not('niche', 'is', null)
    .not('address', 'is', null)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const map = new Map<string, { count: number; lastAt: string | null }>()

  for (const row of data ?? []) {
    const city = extractCity(row.address as string)
    if (!city) continue
    const key = `${row.niche}::${city}`
    const existing = map.get(key)
    const updatedAt = row.status_updated_at as string | null
    if (existing) {
      existing.count++
      if (updatedAt && (!existing.lastAt || updatedAt > existing.lastAt)) {
        existing.lastAt = updatedAt
      }
    } else {
      map.set(key, { count: 1, lastAt: updatedAt })
    }
  }

  const territories: Territory[] = []
  for (const [key, val] of map) {
    const [niche, city] = key.split('::')
    territories.push({
      niche,
      city,
      lead_count: val.count,
      last_run_at: val.lastAt,
    })
  }

  return Response.json(territories)
}
