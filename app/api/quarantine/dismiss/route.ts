import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'

interface Body {
  quarantine_id?: unknown
}

/**
 * Dismiss a quarantined inbound without attributing it to any lead — for
 * spam, wrong-number, or unrelatable auto-replies from unknown contacts.
 *
 * Sets `resolved = true` and leaves `resolved_to_place_id = null` as the
 * sentinel meaning "triaged away, not a CRM lead." The row stays in the
 * table as an audit trail but falls out of the `/api/quarantine` list.
 */
export async function POST(request: Request) {
  if (!(await getAuthUser())) return unauthorizedResponse()

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const quarantineId =
    typeof body.quarantine_id === 'string' ? body.quarantine_id.trim() : ''
  if (!quarantineId) {
    return Response.json(
      { error: 'missing_fields', required: ['quarantine_id'] },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('webhook_inbound_quarantine')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_to_place_id: null,
    })
    .eq('id', quarantineId)
    .eq('resolved', false)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
