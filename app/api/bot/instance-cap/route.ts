import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { getInstances } from '@/lib/whatsapp'

/**
 * PATCH /api/bot/instance-cap
 *
 * Body: { instance_name: string, daily_cap: number }
 *
 * Upserts the daily cap for a known instance. "Known" means listed in the
 * env-var instances (getInstances) — refusing unknown names prevents the UI
 * from creating orphan rows that no bot run will ever consult.
 *
 * Range 0..500 enforced both here and by the table CHECK constraint. 0 is
 * valid and means "do not send from this instance at all".
 */

interface PatchPayload {
  instance_name: string
  daily_cap: number
}

type ValidationResult =
  | { ok: true; payload: PatchPayload }
  | { ok: false; error: string; status: number }

function validate(raw: unknown, knownNames: Set<string>): ValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'body must be a JSON object', status: 400 }
  }
  const b = raw as Record<string, unknown>

  if (typeof b.instance_name !== 'string' || !b.instance_name.trim()) {
    return { ok: false, error: 'instance_name is required', status: 400 }
  }
  if (!knownNames.has(b.instance_name)) {
    return {
      ok: false,
      error: `unknown instance: ${b.instance_name}`,
      status: 404,
    }
  }
  if (typeof b.daily_cap !== 'number' || !Number.isInteger(b.daily_cap)) {
    return { ok: false, error: 'daily_cap must be an integer', status: 400 }
  }
  if (b.daily_cap < 0 || b.daily_cap > 500) {
    return {
      ok: false,
      error: 'daily_cap must be between 0 and 500',
      status: 400,
    }
  }

  return {
    ok: true,
    payload: {
      instance_name: b.instance_name,
      daily_cap: b.daily_cap,
    },
  }
}

export async function PATCH(request: Request) {
  if (!await getAuthUser()) return unauthorizedResponse()

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const knownNames = new Set(getInstances().map(i => i.name))
  const validation = validate(raw, knownNames)
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: validation.status })
  }
  const { payload } = validation

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('evolution_instance_config')
    .upsert(
      {
        instance_name: payload.instance_name,
        daily_cap: payload.daily_cap,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'instance_name' },
    )
    .select('instance_name, daily_cap, updated_at')
    .single()

  if (error) {
    console.error(
      '[instance-cap:patch] upsert failed:',
      'instance=', payload.instance_name,
      'cap=', payload.daily_cap,
      'error=', error.message,
    )
    return Response.json({ error: error.message }, { status: 500 })
  }

  console.log(
    '[instance-cap:patch] instance=', payload.instance_name,
    'cap=', payload.daily_cap,
  )

  return Response.json({ ok: true, config: data })
}
