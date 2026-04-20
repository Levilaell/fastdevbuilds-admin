import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'

const VALID_REASONS = ['not_responded', 'refused', 'price', 'competitor', 'other'] as const
type LostReason = (typeof VALID_REASONS)[number]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()

  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const reason = body?.reason
  if (typeof reason !== 'string' || !VALID_REASONS.includes(reason as LostReason)) {
    return Response.json(
      { error: `reason must be one of: ${VALID_REASONS.join(', ')}` },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('leads')
    .update({
      status: 'lost',
      lost_reason: reason,
      lost_at: new Date().toISOString(),
    })
    .eq('place_id', place_id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
