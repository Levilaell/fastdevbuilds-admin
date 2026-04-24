'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import {
  PIPELINE_COLUMNS,
  PIPELINE_COLUMN_LABELS,
  PROJECT_COLUMNS,
  US_PIPELINE_COLUMNS,
  US_PIPELINE_COLUMN_LABELS,
  getPipelineColumn,
  getUSPipelineColumn,
  type LeadCard,
  type LeadStatus,
  type PipelineColumn,
  type USPipelineColumn,
  type ProjectStatus,
} from '@/lib/types'
import LeadCardComponent from './lead-card'
import PipelineFilters from './pipeline-filters'

function EmptyColumn() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-30">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="9" x2="15" y2="15" />
        <line x1="15" y1="9" x2="9" y2="15" />
      </svg>
      <span className="text-xs">Nenhum lead</span>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-lg p-3 animate-pulse">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="h-4 bg-border rounded w-3/4" />
        <div className="h-4 bg-border rounded w-12" />
      </div>
      <div className="h-1.5 bg-border rounded-full w-full mb-2" />
      <div className="flex justify-between">
        <div className="h-3 bg-border rounded w-16" />
        <div className="h-3 bg-border rounded w-10" />
      </div>
    </div>
  )
}

export function KanbanSkeleton() {
  return (
    <div className="flex gap-2 pb-4 px-3 sm:px-6 pt-4 overflow-x-auto">
      {PIPELINE_COLUMNS.map((col) => (
        <div key={col} className="min-w-[260px] shrink-0 xl:min-w-0 xl:flex-1 xl:shrink">
          <div className="flex items-center gap-2 mb-3 px-3 pt-3">
            <div className="h-4 bg-border rounded w-20" />
            <div className="h-5 bg-border rounded w-7" />
          </div>
          <div className="space-y-2 px-2 pb-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      ))}
    </div>
  )
}

interface KanbanBoardProps {
  initialLeads: LeadCard[]
  market?: 'BR' | 'US'
}

export default function KanbanBoard({ initialLeads, market = 'BR' }: KanbanBoardProps) {
  const [leads, setLeads] = useState<LeadCard[]>(initialLeads)
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState('')
  const [minScore, setMinScore] = useState(0)
  const [niche, setNiche] = useState('')
  const [toast, setToast] = useState('')

  const niches = useMemo(() => {
    const set = new Set<string>()
    initialLeads.forEach((l) => {
      if (l.niche) set.add(l.niche)
    })
    return Array.from(set).sort()
  }, [initialLeads])

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      // Defensive: hide any lead whose country doesn't match the selected
      // tab. Server already filters but cached responses or data drift can
      // leak — belt and suspenders.
      if (market === 'US' && l.country !== 'US') return false
      if (market === 'BR' && l.country !== 'BR' && l.country !== null) return false
      if (search && !(l.business_name ?? '').toLowerCase().includes(search.toLowerCase())) return false
      if (channel && l.outreach_channel !== channel) return false
      if (minScore > 0 && (l.pain_score ?? 0) < minScore) return false
      if (niche && l.niche !== niche) return false
      return true
    })
  }, [leads, search, channel, minScore, niche, market])

  const columns = market === 'US' ? US_PIPELINE_COLUMNS : PIPELINE_COLUMNS
  const columnLabels =
    market === 'US'
      ? (US_PIPELINE_COLUMN_LABELS as Record<string, string>)
      : (PIPELINE_COLUMN_LABELS as Record<string, string>)

  const grouped = useMemo(() => {
    const map: Record<string, LeadCard[]> = {}
    for (const c of columns) map[c] = []
    filtered.forEach((l) => {
      const col =
        market === 'US'
          ? getUSPipelineColumn(
              l.status,
              l.project_status ?? null,
              l.project_claude_code_prompt ?? null,
              l.project_preview_url ?? null,
              l.project_preview_sent_at ?? null,
            )
          : getPipelineColumn(l.status, l.project_status ?? null)
      if (col && map[col]) map[col].push(l)
    })
    return map
  }, [filtered, columns, market])

  const handleDragEnd = useCallback(async (result: DropResult) => {
    // US pipeline is driven by project/send state (not draggable — each column
    // transition requires a concrete action like "paste URL", "send preview").
    // Block drag-and-drop on the US tab to prevent accidental state writes.
    if (market === 'US') return

    const { draggableId, destination, source } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const targetCol = destination.droppableId as PipelineColumn
    const sourceCol = source.droppableId as PipelineColumn
    const lead = leads.find((l) => l.place_id === draggableId)
    if (!lead) return

    // Dropping into a project-state column requires an active project. We
    // don't auto-create one here (option A: fail loud) to avoid writing
    // projects with default scope/price/etc that the user would have to
    // fix up later — cleaner to send them to the inbox flow that collects
    // real context.
    if (PROJECT_COLUMNS.includes(targetCol) && !lead.project_status) {
      setToast('Crie o projeto pelo inbox antes de mover o lead pra essa coluna')
      setTimeout(() => setToast(''), 5000)
      return
    }

    // Resolve what API call the drop implies.
    // Project columns → PATCH project.status (value == column key, because
    // we deliberately named them after the project enum).
    // Lead columns → PATCH lead.status (with the small mapping below).
    const isProjectColumn = PROJECT_COLUMNS.includes(targetCol)
    const leadStatusForColumn: Record<PipelineColumn, LeadStatus | null> = {
      prospected: 'prospected',
      sent: 'sent',
      replied: 'replied',
      preview_sent: null,
      adjusting: null,
      delivered: null,
    }

    // Optimistic local update — revert on failure.
    const snapshot = { status: lead.status, project_status: lead.project_status ?? null }
    setLeads((prev) =>
      prev.map((l) =>
        l.place_id === draggableId
          ? {
              ...l,
              ...(isProjectColumn
                ? { project_status: targetCol as ProjectStatus }
                : { status: leadStatusForColumn[targetCol] as LeadStatus }),
              status_updated_at: new Date().toISOString(),
            }
          : l
      )
    )

    try {
      const res = isProjectColumn
        ? await fetch(`/api/projects/${encodeURIComponent(draggableId)}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: targetCol }),
          })
        : await fetch(`/api/leads/${encodeURIComponent(draggableId)}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: leadStatusForColumn[targetCol] }),
          })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const msg = body?.error ?? `HTTP ${res.status}`
        setLeads((prev) =>
          prev.map((l) =>
            l.place_id === draggableId ? { ...l, ...snapshot } : l,
          ),
        )
        setToast(`Erro ao mover lead (de ${sourceCol} pra ${targetCol}): ${msg}`)
        setTimeout(() => setToast(''), 5000)
      }
    } catch {
      setLeads((prev) =>
        prev.map((l) => (l.place_id === draggableId ? { ...l, ...snapshot } : l)),
      )
      setToast('Erro de conexão — status revertido')
      setTimeout(() => setToast(''), 4000)
    }
  }, [leads])

  return (
    <>
      <div className="px-3 sm:px-6 pt-4">
        <PipelineFilters
          search={search}
          onSearchChange={setSearch}
          channel={channel}
          onChannelChange={setChannel}
          minScore={minScore}
          onMinScoreChange={setMinScore}
          niche={niche}
          onNicheChange={setNiche}
          niches={niches}
        />
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-2 pb-4 px-3 sm:px-6 overflow-x-auto">
          {columns.map((col) => {
            const cards = grouped[col] ?? []
            return (
              <div key={col} className="min-w-[260px] shrink-0 xl:min-w-0 xl:flex-1 xl:shrink bg-sidebar border border-border rounded-xl">
                <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                  <h2 className="text-xs font-semibold text-text uppercase tracking-wide">
                    {columnLabels[col]}
                  </h2>
                  <span className="bg-border text-text text-[11px] font-mono px-1.5 py-0.5 rounded min-w-[22px] text-center">
                    {cards.length}
                  </span>
                </div>

                <Droppable droppableId={col}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`space-y-2 overflow-y-auto px-2 pb-3 min-h-[80px] ${
                        snapshot.isDraggingOver ? 'bg-accent/5' : ''
                      }`}
                      style={{ maxHeight: 'calc(100vh - 200px)' }}
                    >
                      {cards.length === 0 && !snapshot.isDraggingOver && <EmptyColumn />}
                      {cards.map((lead, index) => (
                        <Draggable key={lead.place_id} draggableId={lead.place_id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={snapshot.isDragging ? 'opacity-90 rotate-1' : ''}
                            >
                              <LeadCardComponent lead={lead} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg bg-danger/90 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </>
  )
}
