import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  STATUS_LABELS,
  STATUS_COLORS,
  type Lead,
  type Conversation,
  type Project,
} from '@/lib/types'
import TechAnalysis from '@/components/lead-detail/tech-analysis'
import PainScoreCard from '@/components/lead-detail/pain-score-card'
import OutreachCard from '@/components/lead-detail/outreach-card'
import StatusSelect from '@/components/lead-detail/status-select'
import ConversationPanel from '@/components/lead-detail/conversation-panel'
import ProjectStatusSection from '@/components/lead-detail/project-status'

function LeadDetailSkeleton() {
  return (
    <div className="flex h-full animate-pulse">
      <div className="w-[400px] flex-none p-6 space-y-4 border-r border-border overflow-y-auto">
        <div className="h-6 bg-border rounded w-48" />
        <div className="h-4 bg-border rounded w-32" />
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-4 bg-border rounded" />
          ))}
        </div>
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="h-16 bg-border rounded" />
          <div className="h-2 bg-border rounded-full" />
        </div>
      </div>
      <div className="flex-1 p-6">
        <div className="h-8 bg-border rounded w-40 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-border rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}

async function LeadDetailContent({ id }: { id: string }) {
  const supabase = await createClient()
  const svc = createServiceClient()

  const [leadResult, convResult, projectResult] = await Promise.all([
    supabase.from('leads').select('*').eq('place_id', id).single(),
    svc
      .from('conversations')
      .select('*')
      .eq('place_id', id)
      .order('sent_at', { ascending: true }),
    supabase
      .from('projects')
      .select('*')
      .eq('place_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (leadResult.error && leadResult.error.code === 'PGRST116') {
    notFound()
  }

  if (leadResult.error) {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        <p className="text-sm">Erro ao carregar lead: {leadResult.error.message}</p>
      </div>
    )
  }

  const lead = leadResult.data as Lead
  const conversations = (convResult.data ?? []) as Conversation[]
  const project = (projectResult.data as Project | null) ?? null

  // Mark inbound unread messages as read
  const unreadIds = conversations
    .filter((c) => c.direction === 'in' && !c.read_at)
    .map((c) => c.id)

  if (unreadIds.length > 0) {
    await svc
      .from('conversations')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds)
  }


  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Left column — 400px fixed */}
      <div className="w-[400px] flex-none border-r border-border overflow-y-auto">
        <div className="p-6 space-y-5">
          {/* Breadcrumb + back */}
          <div className="flex items-center gap-2 text-xs text-muted">
            <Link href="/pipeline" className="hover:text-text">
              Pipeline
            </Link>
            <span>/</span>
            <span className="text-text truncate">{lead.business_name || 'Sem nome'}</span>
          </div>

          {/* Header */}
          <div>
            <h1 className="text-xl font-semibold text-text truncate">
              {lead.business_name || 'Sem nome'}
            </h1>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Channel badge */}
              {lead.outreach_channel && lead.outreach_channel !== 'pending' && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    lead.outreach_channel === 'whatsapp'
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                  }`}
                >
                  {lead.outreach_channel}
                </span>
              )}
              {/* Instance badge */}
              {lead.evolution_instance && (
                <span className="text-[10px] text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700/50 bg-zinc-800/50 tabular-nums">
                  {lead.evolution_instance}
                </span>
              )}
              {/* Status badge */}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[lead.status]}`}>
                {STATUS_LABELS[lead.status]}
              </span>
            </div>

            {/* Contact info */}
            <div className="mt-3 space-y-1 text-sm">
              {lead.website && (
                <a
                  href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-accent hover:underline truncate"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  {lead.website}
                </a>
              )}
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-1.5 text-text/80 hover:text-text"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  {lead.phone}
                </a>
              )}
              {(lead.city || lead.address) && (
                <p className="text-muted text-xs">
                  {[lead.city, lead.address].filter(Boolean).join(' — ')}
                </p>
              )}
            </div>
          </div>

          {/* Tech Analysis */}
          <TechAnalysis lead={lead} />

          {/* Pain Score */}
          <PainScoreCard lead={lead} />

          {/* Outreach */}
          <OutreachCard lead={lead} />

          {/* Pipeline actions */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-xs font-semibold text-text uppercase tracking-wide mb-3">Pipeline</h2>
            <StatusSelect placeId={lead.place_id} initialStatus={lead.status} />
          </div>

          {/* Project status (when project exists) */}
          {project && (
            <ProjectStatusSection
              project={project}
              placeId={lead.place_id}
            />
          )}
        </div>
      </div>

      {/* Right column — conversations */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-xs font-semibold text-text uppercase tracking-wide">Conversa</h2>
        </div>
        <ConversationPanel
          placeId={lead.place_id}
          initialConversations={conversations}
          channel={lead.outreach_channel === 'email' ? 'email' : 'whatsapp'}
        />
      </div>
    </div>
  )
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <Suspense fallback={<LeadDetailSkeleton />}>
      <LeadDetailContent id={id} />
    </Suspense>
  )
}
