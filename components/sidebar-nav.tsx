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

function IconLab() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v6.41L4.55 17.5A2 2 0 0 0 6.36 20h11.28a2 2 0 0 0 1.81-2.5L15 8.41V2" />
      <line x1="9" y1="2" x2="15" y2="2" />
      <line x1="6" y1="13" x2="18" y2="13" />
    </svg>
  )
}

const navItems = [
  { href: '/pipeline', label: 'Pipeline', icon: IconPipeline },
  { href: '/inbox', label: 'Inbox', icon: IconInbox, badge: 'unread' as const },
  { href: '/experiments', label: 'Lab', icon: IconLab },
  { href: '/bot', label: 'Bot', icon: IconBot },
  { href: '/metrics', label: 'Metrics', icon: IconMetrics },
]

export default function SidebarNav() {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    async function fetchUnread() {
      const { count } = await supabase
        .from('conversations')
        .select('place_id, leads!inner(status, inbox_archived_at)', { count: 'exact', head: true })
        .eq('direction', 'in')
        .is('read_at', null)
        .not('leads.status', 'in', '("disqualified","lost")')
        .is('leads.inbox_archived_at', null)
      setUnreadCount(count ?? 0)
    }

    function debouncedFetch() {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => fetchUnread(), 500)
    }

    fetchUnread()

    const channel = supabase
      .channel('nav-counters')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
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
        const badgeCount = badge === 'unread' ? unreadCount : 0
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
              isActive
                ? 'bg-card-hover text-text border-l-2 border-accent -ml-px'
                : 'text-muted hover:text-text hover:bg-card'
            }`}
          >
            <Icon />
            <span className="flex-1">{label}</span>
            {badge && badgeCount > 0 && (
              <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold bg-accent text-white">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
