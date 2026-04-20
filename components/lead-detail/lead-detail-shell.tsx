'use client'

import { useState } from 'react'

export default function LeadDetailShell({
  info,
  conversation,
}: {
  info: React.ReactNode
  conversation: React.ReactNode
}) {
  const [tab, setTab] = useState<'info' | 'conversation'>('conversation')

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] lg:flex-row">
      {/* Mobile tabs */}
      <div className="lg:hidden flex border-b border-border shrink-0">
        <button
          onClick={() => setTab('info')}
          className={`flex-1 py-2.5 text-xs font-medium uppercase tracking-wide ${
            tab === 'info'
              ? 'text-accent border-b-2 border-accent -mb-px'
              : 'text-muted hover:text-text'
          }`}
        >
          Detalhes
        </button>
        <button
          onClick={() => setTab('conversation')}
          className={`flex-1 py-2.5 text-xs font-medium uppercase tracking-wide ${
            tab === 'conversation'
              ? 'text-accent border-b-2 border-accent -mb-px'
              : 'text-muted hover:text-text'
          }`}
        >
          Conversa
        </button>
      </div>

      {/* Info panel */}
      <div
        className={`w-full lg:w-[400px] flex-none border-b lg:border-b-0 lg:border-r border-border overflow-y-auto ${
          tab === 'info' ? 'flex' : 'hidden'
        } lg:flex flex-col`}
      >
        {info}
      </div>

      {/* Conversation panel */}
      <div
        className={`flex-1 flex-col min-w-0 ${
          tab === 'conversation' ? 'flex' : 'hidden'
        } lg:flex`}
      >
        {conversation}
      </div>
    </div>
  )
}
