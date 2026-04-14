import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { createServiceClient } from '@/lib/supabase/service'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { status } = body as { status?: string }

  if (status !== 'failed' && status !== 'completed') {
    return Response.json({ error: 'status must be failed or completed' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('bot_runs')
    .update({ status, finished_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
