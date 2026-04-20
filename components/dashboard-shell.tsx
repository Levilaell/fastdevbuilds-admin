'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import SidebarNav from '@/components/sidebar-nav'
import LogoutButton from '@/components/logout-button'
import PageHeader from '@/components/page-header'
import UserAvatar from '@/components/user-avatar'

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [prevPathname, setPrevPathname] = useState(pathname)

  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <div className="flex h-full">
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`w-60 flex-none flex flex-col bg-sidebar border-r border-border fixed inset-y-0 left-0 z-30 transform transition-transform duration-200 ease-out lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold text-text block leading-tight truncate">FastDevBuilds</span>
            <span className="text-[11px] text-muted leading-tight">Admin Panel</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-1 -mr-1 rounded text-muted hover:text-text hover:bg-card"
            aria-label="Fechar menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav />
        </div>

        <div className="px-3 py-3 border-t border-border space-y-2">
          <LogoutButton />
          <span className="block text-center text-[10px] text-muted/60">v0.1.0</span>
        </div>
      </aside>

      <div className="flex-1 flex flex-col lg:ml-60 min-w-0">
        <header className="h-14 flex items-center gap-3 px-4 sm:px-6 border-b border-border bg-bg fixed top-0 right-0 left-0 lg:left-60 z-20">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden p-1.5 -ml-1.5 rounded text-muted hover:text-text hover:bg-card"
            aria-label="Abrir menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <PageHeader />
          </div>
          <UserAvatar />
        </header>

        <main className="flex-1 overflow-y-auto pt-14">{children}</main>
      </div>
    </div>
  )
}
