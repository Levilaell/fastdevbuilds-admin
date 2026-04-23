import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { LeadCard } from '@/lib/types'
import KanbanBoard, { KanbanSkeleton } from '@/components/pipeline/kanban-board'

const CARD_COLUMNS = 'place_id, business_name, city, pain_score, outreach_channel, evolution_instance, status, status_updated_at, niche'

async function PipelineBoard() {
  const supabase = await createClient()

  const [leadsRes, projectsRes, unreadsRes] = await Promise.all([
    supabase
      .from('leads')
      .select(CARD_COLUMNS)
      .in('status', ['prospected', 'sent', 'replied', 'negotiating'])
      .order('status_updated_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('projects')
      .select('place_id, status'),
    supabase
      .from('conversations')
      .select('place_id')
      .eq('direction', 'in')
      .is('read_at', null),
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

  // Build lookup maps
  const projectMap = new Map<string, { status: string }>()
  for (const p of projectsRes.data ?? []) {
    projectMap.set(p.place_id, p)
  }
  const unreadSet = new Set((unreadsRes.data ?? []).map(r => r.place_id))

  const leads: LeadCard[] = (leadsRes.data ?? []).map((lead) => {
    const proj = projectMap.get(lead.place_id)
    return {
      ...lead,
      project_status: (proj?.status as LeadCard['project_status']) ?? null,
      has_unread: unreadSet.has(lead.place_id),
    }
  })

  return <KanbanBoard initialLeads={leads} />
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<KanbanSkeleton />}>
      <PipelineBoard />
    </Suspense>
  )
}
