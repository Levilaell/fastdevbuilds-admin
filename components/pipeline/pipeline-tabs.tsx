'use client'

import Link from 'next/link'
import type { LeadCard } from '@/lib/types'
import KanbanBoard from './kanban-board'

interface PipelineTabsProps {
  market: 'BR' | 'US'
  initialLeads: LeadCard[]
}

export default function PipelineTabs({ market, initialLeads }: PipelineTabsProps) {
  return (
    <div className="flex flex-col">
      <div className="px-3 sm:px-6 pt-4">
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-medium">
          <Link
            href="/pipeline"
            className={`px-4 py-1.5 ${
              market === 'BR'
                ? 'bg-accent/15 text-accent'
                : 'text-muted hover:text-text'
            }`}
          >
            🇧🇷 Brasil
          </Link>
          <Link
            href="/pipeline?market=US"
            className={`px-4 py-1.5 border-l border-border ${
              market === 'US'
                ? 'bg-accent/15 text-accent'
                : 'text-muted hover:text-text'
            }`}
          >
            🇺🇸 United States
          </Link>
        </div>
      </div>

      <KanbanBoard market={market} initialLeads={initialLeads} />
    </div>
  )
}
