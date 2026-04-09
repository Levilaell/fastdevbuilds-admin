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

export default function LeadCardComponent({ lead }: { lead: LeadCard }) {
  return (
    <Link
      href={`/leads/${lead.place_id}`}
      className="block bg-card border border-border rounded-lg p-3 hover:bg-card-hover group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-text truncate group-hover:text-accent">
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
  )
}
