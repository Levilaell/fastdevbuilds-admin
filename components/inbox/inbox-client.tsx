'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { timeAgo } from '@/lib/time-ago'
import { STATUS_LABELS, STATUS_COLORS, type InboxItem, type Conversation, type AiSuggestion, type Project } from '@/lib/types'
import AiSuggestionCard from '@/components/ai-suggestion-card'
import ProposalCard from '@/components/proposal-card'
import SharedReplyBox from '@/components/shared/reply-box'

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
  const isWaiting = item.last_direction === 'out' && !hasUnread
  const waitingHours = item.waiting_since
    ? (Date.now() - new Date(item.waiting_since).getTime()) / 3_600_000
    : 0
  const needsFollowUp = isWaiting && waitingHours > 24

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
            : needsFollowUp
              ? 'bg-warning/5 hover:bg-card-hover'
              : 'hover:bg-card-hover'
      }`}
    >
      {/* Status dot */}
      <div className="w-2 pt-1.5 shrink-0">
        {hasUnread ? (
          <div className="w-2 h-2 rounded-full bg-accent" />
        ) : needsFollowUp ? (
          <div className="w-2 h-2 rounded-full bg-warning" />
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
          <span className={`text-[9px] px-1 py-0.5 rounded ${STATUS_COLORS[item.status]}`}>
            {STATUS_LABELS[item.status]}
          </span>
          {needsFollowUp && (
            <span className="text-[9px] px-1 py-0.5 rounded text-warning bg-warning/10 border border-warning/20">
              Follow-up
            </span>
          )}
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
}: {
  leadStatus: string
  project: Project | null
  placeId: string
  loading: boolean
  onAction: (action: PipelineActionFn) => void
}) {
  const projectStatus = project?.status ?? null

  // Determine which button to show based on lead + project state
  let label: string | null = null
  let action: PipelineActionFn | null = null
  let color = 'bg-accent/15 border-accent/30 text-accent hover:bg-accent/25'

  if (leadStatus === 'closed' || leadStatus === 'lost') {
    return null
  }

  if (!projectStatus && leadStatus !== 'scoped') {
    // No project yet — offer to generate scope
    label = 'Gerar Escopo'
    color = 'bg-purple-500/15 border-purple-500/30 text-purple-400 hover:bg-purple-500/25'
    action = async (pid) => {
      await fetch(`/api/leads/${encodeURIComponent(pid)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'scoped' }),
      })
      // Poll for proposal
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const res = await fetch(`/api/projects/${encodeURIComponent(pid)}/status`)
        if (res.ok) {
          const p = await res.json()
          if (p?.proposal_message) break
        }
      }
    }
  } else if (projectStatus === 'approved') {
    label = 'Marcar em progresso →'
    action = async (pid) => {
      await fetch(`/api/projects/${encodeURIComponent(pid)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      })
    }
  } else if (projectStatus === 'in_progress') {
    label = 'Marcar entregue →'
    action = async (pid) => {
      await fetch(`/api/projects/${encodeURIComponent(pid)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'delivered' }),
      })
    }
  } else if (projectStatus === 'delivered') {
    label = 'Cliente aprovou →'
    action = async (pid) => {
      await fetch(`/api/projects/${encodeURIComponent(pid)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'client_approved' }),
      })
    }
  } else if (projectStatus === 'client_approved') {
    label = 'Marcar pago →'
    color = 'bg-success/15 border-success/30 text-success hover:bg-success/25'
    action = async (pid) => {
      await fetch(`/api/projects/${encodeURIComponent(pid)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      })
    }
  } else if (projectStatus === 'paid') {
    return (
      <span className="text-[10px] text-success px-1.5 py-0.5 rounded bg-success/10">
        Pago
      </span>
    )
  }
  // scoped without proposal = waiting, with proposal = shown via ProposalCard

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
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null)
  const [proposal, setProposal] = useState<Project | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [convLoading, setConvLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Fetch inbox list
  const fetchInbox = useCallback(async () => {
    const url = showArchived ? '/api/inbox?archived=true' : '/api/inbox'
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      setItems(data)
    }
    setLoading(false)
  }, [showArchived])

  // Fetch conversation + suggestion + project for active lead
  const fetchConversation = useCallback(async (placeId: string) => {
    setConvLoading(true)
    setSuggestion(null)
    setProposal(null)
    setProject(null)
    const [convRes, sugRes, projRes] = await Promise.all([
      fetch(`/api/conversations/${encodeURIComponent(placeId)}`),
      fetch(`/api/ai-suggestions?place_id=${encodeURIComponent(placeId)}`),
      fetch(`/api/projects/${encodeURIComponent(placeId)}/status`).catch(() => null),
    ])
    if (convRes.ok) setConversations(await convRes.json())
    if (sugRes.ok) {
      const s = await sugRes.json()
      setSuggestion(s ?? null)
    }
    if (projRes && projRes.ok) {
      try {
        const p = await projRes.json()
        if (p) {
          setProject(p)
          if (p.status === 'scoped' && p.proposal_message) {
            setProposal(p)
          }
        }
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
                      waiting_since: newConv.direction === 'out' ? newConv.sent_at : null,
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
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ai_suggestions',
        },
        (payload) => {
          const row = payload.new as AiSuggestion
          if (row.place_id === activePlaceIdRef.current && row.status === 'pending') {
            setSuggestion(row)
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

  // Archive / unarchive a conversation
  async function handleArchive(placeId: string, unarchive = false) {
    if (!unarchive && !confirm('Arquivar esta conversa?')) return
    const url = `/api/inbox/${encodeURIComponent(placeId)}/archive`
    const res = await fetch(url, { method: unarchive ? 'DELETE' : 'POST' })
    if (!res.ok) {
      showToast('Erro ao arquivar conversa', 'error')
      return
    }
    showToast(unarchive ? 'Conversa desarquivada' : 'Conversa arquivada')
    // Remove from current list
    setItems((prev) => prev.filter((i) => i.place_id !== placeId))
    if (activePlaceId === placeId) {
      setActivePlaceId(null)
      setConversations([])
    }
  }

  // Refetch when switching tabs
  useEffect(() => {
    setLoading(true)
    setActivePlaceId(null)
    setConversations([])
    fetchInbox()
  }, [showArchived, fetchInbox])

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

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Left column — conversation list */}
      <div className="w-[360px] flex-none border-r border-border flex flex-col">
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
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`text-[10px] px-2 py-1 rounded-lg border ${
                showArchived
                  ? 'border-accent/30 text-accent bg-accent/10'
                  : 'border-border text-muted hover:text-text'
              }`}
            >
              {showArchived ? 'Ativas' : 'Arquivadas'}
            </button>
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
      <div className="flex-1 flex flex-col min-w-0">
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
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-semibold text-text truncate">
                  {activeItem?.business_name || 'Sem nome'}
                </span>
                {activeItem && (
                  <div className="flex items-center gap-1.5 shrink-0">
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
                    <span className={`text-[9px] px-1 py-0.5 rounded ${STATUS_COLORS[activeItem.status]}`}>
                      {STATUS_LABELS[activeItem.status]}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <InboxPipelineAction
                  leadStatus={activeItem?.status ?? 'prospected'}
                  project={project}
                  placeId={activePlaceId}
                  loading={actionLoading}
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
                        if (p) {
                          setProject(p)
                          if (p.status === 'scoped' && p.proposal_message) setProposal(p)
                          else setProposal(null)
                        }
                      }
                    } finally {
                      setActionLoading(false)
                    }
                  }}
                />
                <button
                  onClick={() => handleArchive(activePlaceId, showArchived)}
                  className="px-2 py-1 text-[10px] rounded-lg border border-border text-muted hover:text-text"
                >
                  {showArchived ? 'Desarquivar' : 'Arquivar'}
                </button>
                <Link
                  href={`/leads/${encodeURIComponent(activePlaceId)}`}
                  className="text-xs text-accent hover:underline"
                >
                  Ver lead
                </Link>
              </div>
            </div>

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

            {/* Proposal card */}
            {proposal && activePlaceId && (
              <div className="px-4 pb-3">
                <ProposalCard
                  project={proposal}
                  placeId={activePlaceId}
                  onApproved={async () => {
                    setProposal(null)
                    // Refresh project state so next pipeline button appears
                    const res = await fetch(`/api/projects/${encodeURIComponent(activePlaceId)}/status`)
                    if (res.ok) {
                      const p = await res.json()
                      if (p) setProject(p)
                    }
                  }}
                  onDismissed={() => setProposal(null)}
                />
              </div>
            )}

            {/* AI suggestion */}
            {suggestion && (
              <AiSuggestionCard
                suggestion={suggestion}
                onDismiss={() => setSuggestion(null)}
                onSent={(conv) => {
                  setConversations((prev) => [...prev, conv])
                  setSuggestion(null)
                }}
              />
            )}

            {/* Reply box */}
            <SharedReplyBox
              placeId={activePlaceId}
              onNewMessage={handleNewMessage}
              enablePhonePrompt
            />
          </>
        )}
      </div>

      {/* Toast notification */}
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
