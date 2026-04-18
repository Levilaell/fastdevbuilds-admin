'use client'

import { memo } from 'react'
import Link from 'next/link'
import type { LeadCard } from '@/lib/types'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/types'
import { timeAgo } from '@/lib/time-ago'

function PainBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-[11px] text-muted">—</span>

  const pct = (score / 10) * 100
  let color = 'bg-emerald-500/70'
  if (score > 6) color = 'bg-red-500/70'
  else if (score >= 4) color = 'bg-yellow-500/70'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted tabular-nums w-4 text-right">{score}</span>
    </div>
  )
}

function ChannelBadge({ channel }: { channel: string | null }) {
  if (!channel || channel === 'pending') {
    return <span className="text-[10px] text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-500/20 bg-zinc-500/10">pendente</span>
  }
  if (channel === 'whatsapp') {
    return <span className="text-[10px] text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10">whatsapp</span>
  }
  return <span className="text-[10px] text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/10">email</span>
}

function PendingIndicator({ lead }: { lead: LeadCard }) {
  const indicators: { label: string; color: string }[] = []

  if (lead.has_unread) {
    indicators.push({ label: 'Nova msg', color: 'text-accent bg-accent/10 border-accent/20' })
  }
  if (lead.has_proposal) {
    indicators.push({ label: 'Proposta', color: 'text-warning bg-warning/10 border-warning/20' })
  }

  if (indicators.length === 0) return null

  return (
    <div className="flex items-center gap-1 mt-1.5">
      {indicators.map((ind) => (
        <span
          key={ind.label}
          className={`text-[9px] px-1 py-0.5 rounded border font-medium ${ind.color}`}
        >
          {ind.label}
        </span>
      ))}
    </div>
  )
}

interface LeadCardProps {
  lead: LeadCard
  onDisqualify?: (placeId: string) => void
}

function LeadCardComponent({ lead, onDisqualify }: LeadCardProps) {
  return (
    <div className="relative group">
      <Link
        href={`/leads/${lead.place_id}`}
        className="block bg-card border border-border rounded-lg p-3 hover:bg-card-hover group/link"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-medium text-text truncate group-hover/link:text-accent">
            {lead.business_name || 'Sem nome'}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            {lead.evolution_instance && (
              <span className="text-[9px] text-zinc-500 px-1 py-0.5 rounded border border-zinc-700/50 bg-zinc-800/50 tabular-nums">
                {lead.evolution_instance}
              </span>
            )}
            <ChannelBadge channel={lead.outreach_channel} />
          </div>
        </div>

        <PainBar score={lead.pain_score} />

        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-muted truncate">
            {lead.city || '—'}
          </span>
          <span className="text-[11px] text-muted tabular-nums shrink-0">
            {timeAgo(lead.status_updated_at)}
          </span>
        </div>

        {/* Project status badge */}
        {lead.project_status && (
          <div className="mt-1.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent/80 border border-accent/15">
              {PROJECT_STATUS_LABELS[lead.project_status as ProjectStatus] ?? lead.project_status}
            </span>
          </div>
        )}

        {/* Pending action indicators */}
        <PendingIndicator lead={lead} />
      </Link>

      {/* Disqualify button — visible on hover */}
      {onDisqualify && (
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDisqualify(lead.place_id)
          }}
          title="Desqualificar"
          className="absolute top-2 right-2 p-1 rounded bg-card border border-border text-muted hover:text-danger hover:border-danger/50 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </button>
      )}
    </div>
  )
}

export default memo(LeadCardComponent)
