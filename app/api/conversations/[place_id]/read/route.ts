import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ place_id: string }> }
) {
  const { place_id } = await params
  const supabase = await createClient()

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
