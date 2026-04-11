import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('leads')
    .update({ inbox_archived_at: new Date().toISOString() })
    .eq('place_id', place_id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('leads')
    .update({ inbox_archived_at: null })
    .eq('place_id', place_id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
