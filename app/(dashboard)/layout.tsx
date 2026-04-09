import { Geist } from 'next/font/google'
import '../globals.css'
import SidebarNav from '@/components/sidebar-nav'
import LogoutButton from '@/components/logout-button'
import PageHeader from '@/components/page-header'
import UserAvatar from '@/components/user-avatar'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={`${geist.variable} h-full`}>
      <body className="h-full bg-bg text-text font-sans">
        <div className="flex h-full">
          {/* Sidebar — fixed 240px */}
          <aside className="w-60 flex-none flex flex-col bg-sidebar border-r border-border fixed inset-y-0 left-0 z-30">
            {/* Logo */}
            <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div>
                <span className="text-sm font-bold text-text block leading-tight">FastDevBuilds</span>
                <span className="text-[11px] text-muted leading-tight">Admin Panel</span>
              </div>
            </div>

            {/* Nav links */}
            <div className="flex-1 overflow-y-auto py-4">
              <SidebarNav />
            </div>

            {/* Footer */}
            <div className="px-3 py-3 border-t border-border space-y-2">
              <LogoutButton />
              <span className="block text-center text-[10px] text-muted/60">v0.1.0</span>
            </div>
          </aside>

          {/* Main area — offset by sidebar */}
          <div className="flex-1 flex flex-col ml-60 min-w-0">
            {/* Header — fixed 56px */}
            <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-bg fixed top-0 right-0 left-60 z-20">
              <PageHeader />
              <UserAvatar />
            </header>

            {/* Page content */}
            <main className="flex-1 overflow-y-auto pt-14">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
