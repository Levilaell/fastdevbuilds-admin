import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { id } = await params
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('ai_suggestions')
    .update({ status: 'rejected' })
    .eq('id', id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
