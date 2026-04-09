'use client'

import { usePathname } from 'next/navigation'

const pageTitles: Record<string, string> = {
  '/pipeline': 'Pipeline',
  '/inbox': 'Inbox',
  '/bot': 'Bot',
  '/metrics': 'Metrics',
}

export default function PageHeader() {
  const pathname = usePathname()

  // Match /leads/[id] pattern
  const isLeadDetail = pathname.startsWith('/leads/')
  const title = isLeadDetail
    ? 'Lead Detail'
    : (pageTitles[pathname] ?? 'Dashboard')

  return <span className="text-sm font-medium text-[#F8FAFC]">{title}</span>
}
