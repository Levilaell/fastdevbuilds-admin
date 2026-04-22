import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { getInstances } from '@/lib/whatsapp'

/**
 * Returns daily send usage per Evolution instance for the /bot UI.
 *
 * - `daily_cap` comes from `evolution_instance_config` (persisted, editable).
 * - `sent_today` counts leads.outreach_sent=true since UTC midnight for each
 *   `evolution_instance` value. This mirrors the check `nextInstance()` does
 *   in prospect-bot/lib/whatsapp.js so the UI and the bot see the same number.
 * - `remaining = max(0, daily_cap - sent_today)`. UI uses this to bound the
 *   "send this run" input and to disable Run if all instances are at 0.
 *
 * Instances that exist in env vars but not in the config table are returned
 * with a fallback cap of 30 (legacy value) — UI can offer to persist it.
 */

interface InstanceUsage {
  name: string
  daily_cap: number
  sent_today: number
  remaining: number
  configured: boolean
}

const FALLBACK_DAILY_CAP = 30

export async function GET() {
  if (!await getAuthUser()) return unauthorizedResponse()

  const instances = getInstances()
  if (instances.length === 0) {
    return Response.json({ instances: [] })
  }

  const supabase = createServiceClient()
  const instanceNames = instances.map(i => i.name)

  // UTC midnight — same boundary prospect-bot uses
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  // Parallel fetch: caps config + today's sends
  const [configRes, sendsRes] = await Promise.all([
    supabase
      .from('evolution_instance_config')
      .select('instance_name, daily_cap')
      .in('instance_name', instanceNames),
    supabase
      .from('leads')
      .select('evolution_instance')
      .eq('outreach_channel', 'whatsapp')
      .eq('outreach_sent', true)
      .in('evolution_instance', instanceNames)
      .gte('outreach_sent_at', startOfDay.toISOString()),
  ])

  if (configRes.error) {
    console.error('[instance-usage] config query failed:', configRes.error.message)
    return Response.json(
      { error: 'failed to read instance config' },
      { status: 500 },
    )
  }
  if (sendsRes.error) {
    console.error('[instance-usage] sends query failed:', sendsRes.error.message)
    return Response.json(
      { error: 'failed to read send counts' },
      { status: 500 },
    )
  }

  const capMap = new Map<string, number>()
  for (const row of configRes.data ?? []) {
    capMap.set(row.instance_name as string, row.daily_cap as number)
  }

  const countMap = new Map<string, number>()
  for (const name of instanceNames) countMap.set(name, 0)
  for (const row of sendsRes.data ?? []) {
    const name = row.evolution_instance as string
    countMap.set(name, (countMap.get(name) ?? 0) + 1)
  }

  const result: InstanceUsage[] = instances.map(inst => {
    const hasConfig = capMap.has(inst.name)
    const cap = capMap.get(inst.name) ?? FALLBACK_DAILY_CAP
    const sent = countMap.get(inst.name) ?? 0
    return {
      name: inst.name,
      daily_cap: cap,
      sent_today: sent,
      remaining: Math.max(0, cap - sent),
      configured: hasConfig,
    }
  })

  return Response.json({ instances: result })
}
