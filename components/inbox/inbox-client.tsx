'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { timeAgo } from '@/lib/time-ago'
import {
  PIPELINE_COLUMN_LABELS,
  PIPELINE_COLUMN_COLORS,
  getPipelineColumn,
  type InboxItem,
  type Conversation,
  type Project,
} from '@/lib/types'
import SharedReplyBox from '@/components/shared/reply-box'
import MarkLostModal from '@/components/lead-detail/mark-lost-modal'
import WorkflowBar from '@/components/inbox/workflow-bar'
import OrphanMessages from '@/components/inbox/orphan-messages'
import PaidPriceModal from '@/components/lead-detail/paid-price-modal'

// ─── Conversation list item ───

function ConversationListItem({
  item,
  isActive,
  onClick,
}: {
  item: InboxItem
  isActive: boolean
  onClick: () => void
}) {
  const hasUnread = item.unread_count > 0

  const preview = item.last_message
    ? item.last_message.length > 40
      ? item.last_message.slice(0, 40) + '…'
      : item.last_message
    : '—'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 flex items-start gap-3 ${
        isActive
          ? 'bg-card-hover border-l-2 border-accent'
          : hasUnread
            ? 'bg-card/50 hover:bg-card-hover'
            : 'hover:bg-card-hover'
      }`}
    >
      {/* Status dot */}
      <div className="w-2 pt-1.5 shrink-0">
        {hasUnread ? (
          <div className="w-2 h-2 rounded-full bg-accent" />
        ) : null}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${hasUnread ? 'font-semibold text-text' : 'font-medium text-text/80'}`}>
            {item.business_name || 'Sem nome'}
          </span>
          <span className="text-[10px] text-muted shrink-0 tabular-nums">
            {timeAgo(item.last_message_at)}
          </span>
        </div>

        <p className="text-xs text-muted truncate mt-0.5">
          {item.last_direction === 'out' && <span className="text-accent/60">Você: </span>}
          {preview}
        </p>

        <div className="flex items-center gap-1.5 mt-1.5">
          {item.outreach_channel && item.outreach_channel !== 'pending' && (
            <span
              className={`text-[9px] px-1 py-0.5 rounded border ${
                item.outreach_channel === 'whatsapp'
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-blue-400 bg-blue-500/10 border-blue-500/20'
              }`}
            >
              {item.outreach_channel}
            </span>
          )}
          {item.evolution_instance && (
            <span className="text-[9px] text-zinc-500 px-1 py-0.5 rounded border border-zinc-700/50 bg-zinc-800/50 tabular-nums">
              {item.evolution_instance}
            </span>
          )}
          {(() => {
            const col = getPipelineColumn(item.status, item.project_status)
            if (!col) return null
            return (
              <span className={`text-[9px] px-1 py-0.5 rounded ${PIPELINE_COLUMN_COLORS[col]}`}>
                {PIPELINE_COLUMN_LABELS[col]}
              </span>
            )
          })()}
          {hasUnread && (
            <span className="text-[9px] font-semibold text-accent ml-auto">
              {item.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Message bubble ───

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function MessageBubble({ conv }: { conv: Conversation }) {
  const isOut = conv.direction === 'out'
  const isAutoReply = conv.approved_by === 'auto-reply'
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[80%] space-y-1">
        <div
          className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
            isOut
              ? 'bg-accent/15 border border-accent/25 text-text'
              : isAutoReply
                ? 'bg-card border border-border text-text/50'
                : 'bg-card border border-border text-text'
          }`}
        >
          {conv.message}
        </div>
        <div className={`flex items-center gap-2 ${isOut ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-muted">{formatTime(conv.sent_at)}</span>
          {conv.suggested_by_ai && (
            <span className="text-[10px] text-accent/70 px-1.5 py-0.5 rounded bg-accent/10 border border-accent/15">
              IA
            </span>
          )}
          {isAutoReply && (
            <span className="text-[10px] text-warning/70 px-1.5 py-0.5 rounded bg-warning/10 border border-warning/15">
              Auto-reply
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Pipeline action button ───

type PipelineActionFn = (placeId: string) => Promise<void>

function InboxPipelineAction({
  leadStatus,
  project,
  placeId,
  loading,
  onAction,
  onRequestPaid,
}: {
  leadStatus: string
  project: Project | null
  placeId: string
  loading: boolean
  onAction: (action: PipelineActionFn) => void
  onRequestPaid: () => void
}) {
  const projectStatus = project?.status ?? null

  // Determine which button to show based on lead + project state
  let label: string | null = null
  let action: PipelineActionFn | null = null
  const color = 'bg-accent/15 border-accent/30 text-accent hover:bg-accent/25'

  if (leadStatus === 'closed' || leadStatus === 'lost') {
    return null
  }

  if (projectStatus === 'approved') {
    label = 'Marcar preview enviado →'
    action = async (pid) => {
      await fetch(`/api/projects/${encodeURIComponent(pid)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'preview_sent' }),
      })
    }
  } else if (projectStatus === 'preview_sent') {
    label = 'Iniciar ajustes →'
    action = async (pid) => {
      await fetch(`/api/projects/${encodeURIComponent(pid)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'adjusting' }),
      })
    }
  } else if (projectStatus === 'adjusting') {
    label = 'Marcar versão final enviada →'
    action = async (pid) => {
      await fetch(`/api/projects/${encodeURIComponent(pid)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'delivered' }),
      })
    }
  } else if (projectStatus === 'delivered') {
    // Paid transition is modal-gated — the price must be captured before the
    // PATCH so revenue metrics have real numbers. Return a distinct button
    // that fires the parent's onRequestPaid to avoid running through onAction
    // (which wouldn't know to show the modal).
    return (
      <button
        onClick={onRequestPaid}
        disabled={loading}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-success/15 border-success/30 text-success hover:bg-success/25 disabled:opacity-50"
      >
        {loading ? 'Aguarde…' : 'Cliente aprovou e pagou →'}
      </button>
    )
  } else if (projectStatus === 'paid') {
    return (
      <span className="text-[10px] text-success px-1.5 py-0.5 rounded bg-success/10">
        Pago
      </span>
    )
  }

  if (!label || !action) return null

  const actionFn = action
  return (
    <button
      onClick={() => onAction(actionFn)}
      disabled={loading}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-50 ${color}`}
    >
      {loading ? 'Aguarde…' : label}
    </button>
  )
}

// ─── Main Inbox Page ───

export default function InboxClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialLead = searchParams.get('lead')

  const [items, setItems] = useState<InboxItem[]>([])
  const [activePlaceId, setActivePlaceId] = useState<string | null>(initialLead)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showLostModal, setShowLostModal] = useState(false)
  const [showPaidModal, setShowPaidModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [convLoading, setConvLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Fetch inbox list
  const fetchInbox = useCallback(async () => {
    const res = await fetch('/api/inbox')
    if (res.ok) {
      const data = await res.json()
      setItems(data)
    }
    setLoading(false)
  }, [])

  // Fetch conversation + project for active lead
  const fetchConversation = useCallback(async (placeId: string) => {
    setConvLoading(true)
    setProject(null)
    const [convRes, projRes] = await Promise.all([
      fetch(`/api/conversations/${encodeURIComponent(placeId)}`),
      fetch(`/api/projects/${encodeURIComponent(placeId)}/status`).catch(() => null),
    ])
    if (convRes.ok) setConversations(await convRes.json())
    if (projRes && projRes.ok) {
      try {
        const p = await projRes.json()
        if (p) setProject(p)
      } catch { /* no project */ }
    }
    setConvLoading(false)
  }, [])

  // Mark as read
  const markAsRead = useCallback(async (placeId: string) => {
    await fetch(`/api/conversations/${encodeURIComponent(placeId)}/read`, {
      method: 'PATCH',
    })
    // Update local state
    setItems((prev) =>
      prev.map((item) =>
        item.place_id === placeId ? { ...item, unread_count: 0 } : item
      )
    )
    // Notify sidebar to re-fetch unread count
    window.dispatchEvent(new Event('unread-updated'))
  }, [])

  // Select a conversation — mark as read only after confirming the correct conversation loaded
  const selectConversation = useCallback(
    async (placeId: string) => {
      setActivePlaceId(placeId)
      router.replace(`/inbox?lead=${encodeURIComponent(placeId)}`, { scroll: false })
      await fetchConversation(placeId)
      // Only mark as read after conversation loaded, preventing race with fast switching
      if (activePlaceIdRef.current === placeId) {
        await markAsRead(placeId)
      }
    },
    [router, fetchConversation, markAsRead]
  )

  // Initial load
  useEffect(() => {
    fetchInbox()
  }, [fetchInbox])

  // Auto-select from URL param after items load
  useEffect(() => {
    if (initialLead && items.length > 0 && activePlaceId === initialLead && conversations.length === 0 && !convLoading) {
      fetchConversation(initialLead)
      markAsRead(initialLead)
    }
  }, [initialLead, items.length, activePlaceId, conversations.length, convLoading, fetchConversation, markAsRead])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversations.length])

  // Refs for realtime callbacks — avoids recreating the channel on every state change
  const activePlaceIdRef = useRef(activePlaceId)
  activePlaceIdRef.current = activePlaceId
  const fetchInboxRef = useRef(fetchInbox)
  fetchInboxRef.current = fetchInbox
  const markAsReadRef = useRef(markAsRead)
  markAsReadRef.current = markAsRead

  // Realtime subscription — stable, no dependencies that cause recreation
  useEffect(() => {
    const supabase = createClient()
    let fetchDebounce: ReturnType<typeof setTimeout> | null = null

    const channel = supabase
      .channel('inbox-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
        },
        (payload) => {
          const newConv = payload.new as Conversation
          const currentActive = activePlaceIdRef.current
          const isInbound = newConv.direction === 'in'

          // Update inbox list
          setItems((prev) => {
            const existing = prev.find((i) => i.place_id === newConv.place_id)
            if (existing) {
              const updated = prev.map((i) =>
                i.place_id === newConv.place_id
                  ? {
                      ...i,
                      last_message: newConv.message,
                      last_message_at: newConv.sent_at,
                      last_direction: newConv.direction,
                      unread_count: isInbound && currentActive !== newConv.place_id
                        ? i.unread_count + 1
                        : i.unread_count,
                    }
                  : i
              )
              return updated.sort((a, b) => {
                const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
                const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
                return tb - ta
              })
            }
            // New lead not in list — debounced fetch
            if (fetchDebounce) clearTimeout(fetchDebounce)
            fetchDebounce = setTimeout(() => fetchInboxRef.current(), 1000)
            return prev
          })

          // If active conversation, add message
          if (currentActive === newConv.place_id) {
            setConversations((prev) => {
              // Avoid duplicates
              if (prev.some(c => c.id === newConv.id)) return prev
              return [...prev, newConv]
            })
            if (isInbound) markAsReadRef.current(newConv.place_id)
          }

          // Notification sound only for inbound
          if (isInbound) {
            try {
              const audio = new Audio('/sounds/notification.mp3')
              audio.play().catch(() => {})
            } catch {
              // Ignore
            }
          }
        }
      )
      .subscribe()

    return () => {
      if (fetchDebounce) clearTimeout(fetchDebounce)
      supabase.removeChannel(channel)
    }
  }, [])

  // Realtime handles live updates — no polling needed

  // Handle new outbound message
  function handleNewMessage(conv: Conversation) {
    setConversations((prev) => [...prev, conv])
    // Update last message in list
    setItems((prev) =>
      prev.map((i) =>
        i.place_id === conv.place_id
          ? { ...i, last_message: conv.message, last_message_at: conv.sent_at }
          : i
      )
    )
  }

  // Filter items by search
  const filtered = search
    ? items.filter((i) =>
        (i.business_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : items

  const totalUnread = items.reduce((acc, i) => acc + i.unread_count, 0)
  const activeItem = items.find((i) => i.place_id === activePlaceId)

  const showConversationPane = activePlaceId !== null

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Left column — conversation list */}
      <div
        className={`w-full lg:w-[360px] flex-none border-r border-border flex-col ${
          showConversationPane ? 'hidden lg:flex' : 'flex'
        }`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-text">Inbox</h1>
              {totalUnread > 0 && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-white text-xs font-semibold">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </div>
          </div>
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Buscar negócio…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        <OrphanMessages onResolved={fetchInbox} />

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 animate-pulse space-y-2">
                <div className="flex justify-between">
                  <div className="h-4 bg-border rounded w-32" />
                  <div className="h-3 bg-border rounded w-10" />
                </div>
                <div className="h-3 bg-border rounded w-48" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mb-3 opacity-30"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-sm">
                {search ? 'Nenhum resultado' : 'Nenhuma conversa ainda'}
              </p>
            </div>
          ) : (
            filtered.map((item) => (
              <ConversationListItem
                key={item.place_id}
                item={item}
                isActive={activePlaceId === item.place_id}
                onClick={() => selectConversation(item.place_id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right column — active conversation */}
      <div
        className={`flex-1 flex-col min-w-0 ${
          showConversationPane ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {!activePlaceId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mb-3 opacity-20"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm">Selecione uma conversa para começar</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => {
                    setActivePlaceId(null)
                    router.replace('/inbox', { scroll: false })
                  }}
                  className="lg:hidden p-1 -ml-1 rounded text-muted hover:text-text hover:bg-card shrink-0"
                  aria-label="Voltar"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className="text-sm font-semibold text-text truncate">
                  {activeItem?.business_name || 'Sem nome'}
                </span>
                {activeItem && (
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    {activeItem.outreach_channel && activeItem.outreach_channel !== 'pending' && (
                      <span
                        className={`text-[9px] px-1 py-0.5 rounded border ${
                          activeItem.outreach_channel === 'whatsapp'
                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                            : 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                        }`}
                      >
                        {activeItem.outreach_channel}
                      </span>
                    )}
                    {activeItem.evolution_instance && (
                      <span className="text-[9px] text-zinc-500 px-1 py-0.5 rounded border border-zinc-700/50 bg-zinc-800/50 tabular-nums">
                        {activeItem.evolution_instance}
                      </span>
                    )}
                    {(() => {
                      const col = getPipelineColumn(activeItem.status, activeItem.project_status)
                      if (!col) return null
                      return (
                        <span className={`text-[9px] px-1 py-0.5 rounded ${PIPELINE_COLUMN_COLORS[col]}`}>
                          {PIPELINE_COLUMN_LABELS[col]}
                        </span>
                      )
                    })()}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <InboxPipelineAction
                  leadStatus={activeItem?.status ?? 'prospected'}
                  project={project}
                  placeId={activePlaceId}
                  loading={actionLoading}
                  onRequestPaid={() => setShowPaidModal(true)}
                  onAction={async (action) => {
                    if (!activePlaceId || actionLoading) return
                    setActionLoading(true)
                    try {
                      await action(activePlaceId)
                      // Refresh project + lead state
                      const [projRes] = await Promise.all([
                        fetch(`/api/projects/${encodeURIComponent(activePlaceId)}/status`),
                        fetchInbox(),
                      ])
                      if (projRes.ok) {
                        const p = await projRes.json()
                        if (p) setProject(p)
                      }
                    } finally {
                      setActionLoading(false)
                    }
                  }}
                />
                {activeItem && activeItem.status !== 'lost' && activeItem.status !== 'closed' && (
                  <button
                    onClick={() => setShowLostModal(true)}
                    disabled={actionLoading}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    Marcar lost
                  </button>
                )}
                <Link
                  href={`/leads/${encodeURIComponent(activePlaceId)}`}
                  className="text-xs text-accent hover:underline"
                >
                  Ver lead
                </Link>
              </div>
            </div>

            {/* Workflow progress bar */}
            <WorkflowBar
              leadStatus={activeItem?.status ?? 'prospected'}
              projectStatus={project?.status ?? null}
            />

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 p-4">
              {convLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted py-16">
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mb-3 opacity-30"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <p className="text-sm">Nenhuma mensagem</p>
                </div>
              ) : (
                conversations.map((c) => <MessageBubble key={c.id} conv={c} />)
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply box */}
            <SharedReplyBox
              placeId={activePlaceId}
              onNewMessage={handleNewMessage}
              enablePhonePrompt
              channel={
                activeItem?.outreach_channel === 'email'
                  ? 'email'
                  : activeItem?.outreach_channel === 'sms'
                  ? 'sms'
                  : 'whatsapp'
              }
            />
          </>
        )}
      </div>

      {/* Toast notification */}
      {showLostModal && activePlaceId && activeItem && (
        <MarkLostModal
          placeId={activePlaceId}
          businessName={activeItem.business_name ?? 'Lead'}
          onClose={() => setShowLostModal(false)}
          onMarked={() => {
            setShowLostModal(false)
            fetchInbox()
            showToast('Lead marcado como perdido', 'success')
          }}
        />
      )}

      {showPaidModal && activePlaceId && activeItem && (
        <PaidPriceModal
          placeId={activePlaceId}
          businessName={activeItem.business_name ?? 'Lead'}
          onClose={() => setShowPaidModal(false)}
          onPaid={async () => {
            setShowPaidModal(false)
            // Refresh both sides so pipeline column + inbox status reflect paid.
            const projRes = await fetch(
              `/api/projects/${encodeURIComponent(activePlaceId)}/status`,
            )
            if (projRes.ok) {
              const p = await projRes.json()
              if (p) setProject(p)
            }
            fetchInbox()
            showToast('Projeto marcado como pago', 'success')
          }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-white text-sm shadow-lg ${
          toast.type === 'error' ? 'bg-danger/90' : 'bg-success/90'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
