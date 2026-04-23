import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import { PROJECT_STATUSES, type ProjectStatus, type Lead, type Conversation, type Project } from '@/lib/types'
import { getRecentConversations } from '@/lib/supabase/queries'
import { generateClaudeCodePrompt } from '@/lib/ai-workflow'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('place_id', place_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()
  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })
  const body = await request.json()
  const newStatus = body.status as string
  const rawPrice = body.price

  if (!PROJECT_STATUSES.includes(newStatus as ProjectStatus)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Price is only meaningful on the paid transition — accept it optionally
  // there and ignore elsewhere. This is the hook the dashboard uses to
  // capture the final amount (the PaidPriceModal); metrics assume price is
  // filled on every paid row going forward.
  let priceToSet: number | null = null
  if (newStatus === 'paid' && rawPrice !== undefined && rawPrice !== null) {
    const n = typeof rawPrice === 'number' ? rawPrice : Number(rawPrice)
    if (!Number.isFinite(n) || n < 0) {
      return Response.json(
        { error: 'price must be a non-negative number' },
        { status: 400 },
      )
    }
    priceToSet = n
  }

  const supabase = createServiceClient()

  // Stamp the matching lifecycle timestamp so the UI can show "preview foi há
  // 2 dias" without re-deriving from conversations. These columns existed in
  // the schema before but were never populated; this closes that gap.
  const now = new Date().toISOString()
  const stampKey: Partial<Record<ProjectStatus, string>> = {
    approved: 'approved_at',
    preview_sent: 'preview_sent_at',
    delivered: 'delivered_at',
    paid: 'paid_at',
  }
  const update: Record<string, unknown> = { status: newStatus }
  const col = stampKey[newStatus as ProjectStatus]
  if (col) update[col] = now
  if (priceToSet !== null) update.price = priceToSet

  const { data: project, error } = await supabase
    .from('projects')
    .update(update)
    .eq('place_id', place_id)
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Update lead status for terminal project states
  if (newStatus === 'paid') {
    await supabase
      .from('leads')
      .update({ status: 'closed', status_updated_at: now })
      .eq('place_id', place_id)
  } else if (newStatus === 'cancelled') {
    await supabase
      .from('leads')
      .update({ status: 'lost', status_updated_at: now })
      .eq('place_id', place_id)
  }

  // Fire-and-forget: generate Claude Code prompt on approved (client authorized proposal — step 8)
  if (newStatus === 'approved') {
    const [leadRes, convs] = await Promise.all([
      supabase.from('leads').select('*').eq('place_id', place_id).single(),
      getRecentConversations(supabase, place_id, 20),
    ])
    if (leadRes.data) {
      generateClaudeCodePrompt(
        leadRes.data as Lead,
        project as Project,
        convs as Conversation[],
      ).catch(console.error)
    }
  }

  return Response.json(project)
}
