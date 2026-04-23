import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { getInstances } from '@/lib/whatsapp'

/**
 * Returns per-instance send activity for the /bot UI. Hard daily caps were
 * removed — the bot now treats each run as the unit of intent, so the UI
 * only needs a running counter of today's sends. The actual send limit for
 * a given run is the `per_instance_send` target the user enters on the
 * same screen, not a persistent cap.
 */

interface InstanceUsage {
  name: string
  sent_today: number
}

export async function GET() {
  if (!await getAuthUser()) return unauthorizedResponse()

  const instances = getInstances()
  if (instances.length === 0) {
    return Response.json({ instances: [] })
  }

  const supabase = createServiceClient()
  const instanceNames = instances.map(i => i.name)

  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('leads')
    .select('evolution_instance')
    .eq('outreach_channel', 'whatsapp')
    .eq('outreach_sent', true)
    .in('evolution_instance', instanceNames)
    .gte('outreach_sent_at', startOfDay.toISOString())

  if (error) {
    console.error('[instance-usage] sends query failed:', error.message)
    return Response.json(
      { error: 'failed to read send counts' },
      { status: 500 },
    )
  }

  const countMap = new Map<string, number>()
  for (const name of instanceNames) countMap.set(name, 0)
  for (const row of data ?? []) {
    const name = row.evolution_instance as string
    countMap.set(name, (countMap.get(name) ?? 0) + 1)
  }

  const result: InstanceUsage[] = instances.map(inst => ({
    name: inst.name,
    sent_today: countMap.get(inst.name) ?? 0,
  }))

  return Response.json({ instances: result })
}
