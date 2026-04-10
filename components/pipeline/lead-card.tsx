'use client'

import Link from 'next/link'
import type { LeadCard } from '@/lib/types'
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

interface LeadCardProps {
  lead: LeadCard
  onArchive?: (placeId: string, unarchive: boolean) => void
}

export default function LeadCardComponent({ lead, onArchive }: LeadCardProps) {
  const isArchived = !!lead.inbox_archived_at

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
          <ChannelBadge channel={lead.outreach_channel} />
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
      </Link>

      {/* Archive button — visible on hover */}
      {onArchive && (
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onArchive(lead.place_id, isArchived)
          }}
          title={isArchived ? 'Desarquivar' : 'Arquivar'}
          className="absolute top-2 right-2 p-1 rounded bg-card border border-border text-muted hover:text-text hover:border-accent/50 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {isArchived ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}
