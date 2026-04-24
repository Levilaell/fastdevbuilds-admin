'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function IconPipeline() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="5" height="18" rx="1" />
      <rect x="10" y="8" width="5" height="13" rx="1" />
      <rect x="17" y="5" width="5" height="16" rx="1" />
    </svg>
  )
}

function IconInbox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconBot() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}

function IconMetrics() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

const navItems = [
  { href: '/pipeline', label: 'Pipeline', icon: IconPipeline, badge: 'pipeline' as const },
  { href: '/inbox', label: 'Inbox', icon: IconInbox, badge: 'unread' as const },
  { href: '/bot', label: 'Bot', icon: IconBot },
  { href: '/metrics', label: 'Metrics', icon: IconMetrics },
]

export default function SidebarNav() {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)
  const [promptsAwaitingCount, setPromptsAwaitingCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    async function fetchUnread() {
      // Join with leads to exclude disqualified/lost/archived — matches inbox visibility
      const { count } = await supabase
        .from('conversations')
        .select('place_id, leads!inner(status, inbox_archived_at)', { count: 'exact', head: true })
        .eq('direction', 'in')
        .is('read_at', null)
        .not('leads.status', 'in', '("disqualified","lost")')
        .is('leads.inbox_archived_at', null)
      setUnreadCount(count ?? 0)
    }

    async function fetchPromptsAwaiting() {
      // US projects with a Claude Code prompt generated but no preview URL
      // pasted yet — Levi needs to run Claude Code and paste the URL back.
      const { count } = await supabase
        .from('projects')
        .select('id, leads!inner(country, status)', { count: 'exact', head: true })
        .not('claude_code_prompt', 'is', null)
        .is('preview_url', null)
        .eq('leads.country', 'US')
        .not('leads.status', 'in', '("disqualified","lost","closed")')
      setPromptsAwaitingCount(count ?? 0)
    }

    function debouncedFetch() {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        fetchUnread()
        fetchPromptsAwaiting()
      }, 500)
    }

    fetchUnread()
    fetchPromptsAwaiting()

    const channel = supabase
      .channel('nav-counters')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => debouncedFetch(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => debouncedFetch(),
      )
      .subscribe()

    const onUnreadUpdated = () => fetchUnread()
    window.addEventListener('unread-updated', onUnreadUpdated)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
      window.removeEventListener('unread-updated', onUnreadUpdated)
    }
  }, [])

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {navItems.map(({ href, label, icon: Icon, badge }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
        const badgeCount =
          badge === 'unread'
            ? unreadCount
            : badge === 'pipeline'
              ? promptsAwaitingCount
              : 0
        const badgeClass =
          badge === 'pipeline'
            ? 'bg-amber-500 text-white'
            : 'bg-accent text-white'
        return (
          <Link
            key={href}
            href={badge === 'pipeline' && badgeCount > 0 ? '/pipeline?market=US' : href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
              isActive
                ? 'bg-card-hover text-text border-l-2 border-accent -ml-px'
                : 'text-muted hover:text-text hover:bg-card'
            }`}
            title={
              badge === 'pipeline' && badgeCount > 0
                ? `${badgeCount} prompt(s) US aguardando URL do preview`
                : undefined
            }
          >
            <Icon />
            <span className="flex-1">{label}</span>
            {badge && badgeCount > 0 && (
              <span className={`flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold ${badgeClass}`}>
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
