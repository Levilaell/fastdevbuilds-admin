import { Suspense } from 'react'
import InboxClient from '@/components/inbox/inbox-client'

function InboxSkeleton() {
  return (
    <div className="flex h-[calc(100vh-56px)] animate-pulse">
      <div className="w-full lg:w-[360px] flex-none border-r border-border">
        <div className="px-4 py-3 border-b border-border space-y-3">
          <div className="h-5 bg-border rounded w-16" />
          <div className="h-8 bg-border rounded" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3 space-y-2">
              <div className="flex justify-between">
                <div className="h-4 bg-border rounded w-32" />
                <div className="h-3 bg-border rounded w-10" />
              </div>
              <div className="h-3 bg-border rounded w-48" />
            </div>
          ))}
        </div>
      </div>
      <div className="hidden lg:flex flex-1 items-center justify-center text-muted">
        <p className="text-sm">Carregando…</p>
      </div>
    </div>
  )
}

export default function InboxPage() {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <InboxClient />
    </Suspense>
  )
}
