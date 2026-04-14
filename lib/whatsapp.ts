import type { SupabaseClient } from '@supabase/supabase-js'

/** Normalize a Brazilian phone to 55 + DDD + number (12-13 digits). */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) return digits
  const clean = digits.startsWith('0') ? digits.slice(1) : digits
  if (clean.length >= 10 && clean.length <= 11) return `55${clean}`
  return digits
}

/** Check if two phone strings match after normalization. */
export function phoneMatch(a: string, b: string): boolean {
  const na = normalizePhone(a)
  const nb = normalizePhone(b)
  if (!na || !nb) return false
  return na === nb
}

// ─── Multi-instance Evolution API support ───

export interface EvolutionInstance {
  name: string
  apiKey: string
}

/** Read all configured Evolution API instances from numbered env vars. */
export function getInstances(): EvolutionInstance[] {
  const instances: EvolutionInstance[] = []
  for (let i = 1; i <= 10; i++) {
    const name = process.env[`EVOLUTION_INSTANCE_${i}`]
    const apiKey = process.env[`EVOLUTION_API_KEY_${i}`]
    if (name && apiKey) {
      instances.push({ name, apiKey })
    } else {
      break
    }
  }
  return instances
}

/** Find an instance by its API key (used by webhook to identify sender). */
export function getInstanceByKey(apiKey: string): EvolutionInstance | undefined {
  return getInstances().find(inst => inst.apiKey === apiKey)
}

/** Find an instance by name. */
function getInstanceByName(name: string): EvolutionInstance | undefined {
  return getInstances().find(inst => inst.name === name)
}

/**
 * Look up a lead's assigned instance. If none, assign the next one via
 * round-robin and persist the assignment on the lead.
 */
export async function getOrAssignInstance(
  supabase: SupabaseClient,
  placeId: string,
): Promise<EvolutionInstance | null> {
  const instances = getInstances()
  if (instances.length === 0) return null

  // Check if lead already has an assigned instance
  const { data: lead } = await supabase
    .from('leads')
    .select('evolution_instance')
    .eq('place_id', placeId)
    .maybeSingle()

  if (lead?.evolution_instance) {
    const existing = getInstanceByName(lead.evolution_instance)
    if (existing) return existing
    // Instance was removed from config — reassign below
  }

  // Pick the instance with fewest sends in the last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: sent } = await supabase
    .from('leads')
    .select('evolution_instance')
    .not('evolution_instance', 'is', null)
    .not('outreach_sent_at', 'is', null)
    .gte('outreach_sent_at', since)

  const countMap = new Map<string, number>()
  for (const inst of instances) countMap.set(inst.name, 0)
  for (const row of sent ?? []) {
    const name = row.evolution_instance as string
    if (countMap.has(name)) countMap.set(name, (countMap.get(name) ?? 0) + 1)
  }

  let assigned = instances[0]
  let minCount = Infinity
  for (const inst of instances) {
    const c = countMap.get(inst.name) ?? 0
    if (c < minCount) {
      minCount = c
      assigned = inst
    }
  }

  // Persist assignment on lead
  await supabase
    .from('leads')
    .update({ evolution_instance: assigned.name })
    .eq('place_id', placeId)

  console.log(`[whatsapp] assigned instance "${assigned.name}" to lead ${placeId}`)
  return assigned
}

/**
 * Send a WhatsApp message via Evolution API.
 * If instanceName is provided, uses that specific instance.
 * Otherwise uses the first configured instance as fallback.
 */
export async function sendWhatsApp(
  phone: string,
  text: string,
  instanceName?: string,
): Promise<boolean> {
  const url = process.env.EVOLUTION_API_URL
  if (!url) {
    console.error('[whatsapp] EVOLUTION_API_URL not configured')
    return false
  }

  const instances = getInstances()
  if (instances.length === 0) {
    console.error('[whatsapp] No Evolution instances configured')
    return false
  }

  let instance = instances[0]
  if (instanceName) {
    const found = instances.find(i => i.name === instanceName)
    if (found) {
      instance = found
    } else {
      console.warn('[whatsapp] instance', instanceName, 'not found in config — falling back to', instances[0].name)
    }
  }

  const cleanPhone = normalizePhone(phone)
  const endpoint = `${url}/message/sendText/${instance.name}`
  const payload = { number: cleanPhone, textMessage: { text } }
  console.log('[whatsapp] sending to', cleanPhone, 'via', endpoint)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: instance.apiKey,
      },
      body: JSON.stringify(payload),
    })
    const body = await res.text()
    console.log('[whatsapp] status:', res.status, 'body:', body.slice(0, 300))
    return res.ok
  } catch (err) {
    console.error('[whatsapp] fetch error:', err instanceof Error ? err.message : err)
    return false
  }
}
