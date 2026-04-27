import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { LeadCard } from '@/lib/types'
import PipelineTabs from '@/components/pipeline/pipeline-tabs'
import { KanbanSkeleton } from '@/components/pipeline/kanban-board'

// Pipeline state can change any time (bot writes, webhook inbound, user drags) —
// rendering from cache would show stale leads in the wrong tab.
export const dynamic = 'force-dynamic'

const CARD_COLUMNS =
  'place_id, business_name, city, pain_score, outreach_channel, evolution_instance, status, status_updated_at, niche, country'

async function PipelineBoard({ market }: { market: 'BR' | 'US' }) {
  const supabase = await createClient()

  // BR only cares about lead-level statuses; US pulls anything not terminal
  // because the pipeline is driven by the Project row (prompt / URL / sent),
  // not by lead.status.
  const leadStatusFilter =
    market === 'BR'
      ? ['prospected', 'sent', 'replied', 'negotiating']
      : ['prospected', 'sent', 'replied', 'negotiating']

  const [leadsRes, projectsRes, unreadsRes, viewsRes] = await Promise.all([
    supabase
      .from('leads')
      .select(CARD_COLUMNS)
      .eq('country', market)
      .in('status', leadStatusFilter)
      .order('status_updated_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('projects')
      .select('place_id, status, claude_code_prompt, preview_url, preview_sent_at'),
    supabase
      .from('conversations')
      .select('place_id')
      .eq('direction', 'in')
      .is('read_at', null),
    // Beacon rows are tiny and we aggregate in JS to avoid a Postgres function.
    // Once volume crosses ~10k rows this should move to an RPC view.
    supabase.from('preview_views').select('place_id, viewed_at'),
  ])

  if (leadsRes.error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-40">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-sm">Erro ao carregar leads</p>
        <p className="text-xs mt-1">{leadsRes.error.message}</p>
      </div>
    )
  }

  const projectMap = new Map<
    string,
    {
      status: string
      claude_code_prompt: string | null
      preview_url: string | null
      preview_sent_at: string | null
    }
  >()
  for (const p of projectsRes.data ?? []) {
    projectMap.set(p.place_id, p)
  }
  const unreadSet = new Set((unreadsRes.data ?? []).map((r) => r.place_id))

  const viewsByPlace = new Map<string, { firstAt: string; count: number }>()
  for (const v of viewsRes.data ?? []) {
    const cur = viewsByPlace.get(v.place_id)
    if (!cur) {
      viewsByPlace.set(v.place_id, { firstAt: v.viewed_at, count: 1 })
    } else {
      cur.count += 1
      if (v.viewed_at < cur.firstAt) cur.firstAt = v.viewed_at
    }
  }

  const leads: LeadCard[] = (leadsRes.data ?? []).map((lead) => {
    const proj = projectMap.get(lead.place_id)
    const views = viewsByPlace.get(lead.place_id)
    return {
      ...lead,
      project_status: (proj?.status as LeadCard['project_status']) ?? null,
      has_unread: unreadSet.has(lead.place_id),
      project_claude_code_prompt: proj?.claude_code_prompt ?? null,
      project_preview_url: proj?.preview_url ?? null,
      project_preview_sent_at: proj?.preview_sent_at ?? null,
      preview_first_view_at: views?.firstAt ?? null,
      preview_view_count: views?.count ?? 0,
    }
  })

  return <PipelineTabs market={market} initialLeads={leads} />
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string }>
}) {
  const { market: marketParam } = await searchParams
  const market: 'BR' | 'US' = marketParam === 'US' ? 'US' : 'BR'

  return (
    <Suspense fallback={<KanbanSkeleton />}>
      <PipelineBoard market={market} />
    </Suspense>
  )
}
