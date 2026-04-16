import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ place_id: string }> }
) {
  if (!(await getAuthUser())) return unauthorizedResponse()
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('conversations')
    .update({ read_at: new Date().toISOString() })
    .eq('place_id', place_id)
    .eq('direction', 'in')
    .is('read_at', null)
    .select('id')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ updated: data?.length ?? 0 })
}
