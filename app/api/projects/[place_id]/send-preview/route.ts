import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser, unauthorizedResponse } from '@/lib/supabase/auth'
import {
  PREVIEW_DELIVERY_SYSTEM_PROMPT,
  buildPreviewDeliveryUserPrompt,
} from '@/lib/prompts'
import { withViewMarker } from '@/lib/preview-tracking'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  if (!await getAuthUser()) return unauthorizedResponse()

  const { place_id } = await params
  if (!place_id) return Response.json({ error: 'place_id is required' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const previewUrl =
    typeof body?.preview_url === 'string' && body.preview_url.trim()
      ? body.preview_url.trim()
      : null
  if (!previewUrl) {
    return Response.json({ error: 'preview_url is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const [leadRes, projectRes] = await Promise.all([
    supabase.from('leads').select('business_name').eq('place_id', place_id).maybeSingle(),
    supabase.from('projects').select('pending_info').eq('place_id', place_id).maybeSingle(),
  ])

  if (leadRes.error) return Response.json({ error: leadRes.error.message }, { status: 500 })
  if (projectRes.error) return Response.json({ error: projectRes.error.message }, { status: 500 })
  if (!leadRes.data) return Response.json({ error: 'Lead not found' }, { status: 404 })
  if (!projectRes.data) return Response.json({ error: 'Project not found' }, { status: 404 })

  const businessName = leadRes.data.business_name as string
  const rawPending = projectRes.data.pending_info as string | null

  // Parse pending_info (JSON stringified array) into a conversational summary
  let pendingSummary = 'nenhuma'
  if (rawPending && rawPending.trim()) {
    try {
      const parsed = JSON.parse(rawPending)
      if (Array.isArray(parsed) && parsed.length > 0) {
        pendingSummary = parsed.join(', ')
      }
    } catch {
      // Fallback: se não for JSON válido, usa string crua
      pendingSummary = rawPending.trim()
    }
  }

  const trackedUrl = withViewMarker(previewUrl, place_id)
  const userPrompt = buildPreviewDeliveryUserPrompt(businessName, trackedUrl, pendingSummary)

  const anthropic = new Anthropic()
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: PREVIEW_DELIVERY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const message = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  if (!message) {
    return Response.json({ error: 'AI returned empty message' }, { status: 502 })
  }

  return Response.json({ message })
}
