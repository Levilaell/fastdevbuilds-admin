'use client'

import Link from 'next/link'
import type { LeadCard, PipelineMarket } from '@/lib/types'
import KanbanBoard from './kanban-board'

interface PipelineTabsProps {
  market: PipelineMarket
  initialLeads: LeadCard[]
}

const TABS: { key: PipelineMarket; href: string; label: string }[] = [
  { key: 'BR', href: '/pipeline', label: '🇧🇷 Brasil' },
  { key: 'BR-PREVIEW', href: '/pipeline?market=BR-PREVIEW', label: '🇧🇷 BR (Preview)' },
  { key: 'US', href: '/pipeline?market=US', label: '🇺🇸 United States' },
]

export default function PipelineTabs({ market, initialLeads }: PipelineTabsProps) {
  return (
    <div className="flex flex-col">
      <div className="px-3 sm:px-6 pt-4">
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-medium">
          {TABS.map((tab, i) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`px-4 py-1.5 ${i > 0 ? 'border-l border-border' : ''} ${
                market === tab.key
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted hover:text-text'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <KanbanBoard market={market} initialLeads={initialLeads} />
    </div>
  )
}
