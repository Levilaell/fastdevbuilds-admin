'use client'

import { useEffect, useRef } from 'react'
import type { Conversation } from '@/lib/types'

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface ConversationHistoryProps {
  conversations: Conversation[]
}

export default function ConversationHistory({ conversations }: ConversationHistoryProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversations.length])

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-30">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <p className="text-sm">Nenhuma conversa ainda</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-3 p-4">
      {conversations.map((c) => {
        const isOut = c.direction === 'out'
        return (
          <div
            key={c.id}
            className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] space-y-1`}>
              <div
                className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  isOut
                    ? 'bg-accent/15 border border-accent/25 text-text'
                    : 'bg-card border border-border text-text'
                }`}
              >
                {c.message}
              </div>
              <div className={`flex items-center gap-2 ${isOut ? 'justify-end' : 'justify-start'}`}>
                <span className="text-[10px] text-muted">{formatTime(c.sent_at)}</span>
                {c.suggested_by_ai && (
                  <span className="text-[10px] text-accent/70 px-1.5 py-0.5 rounded bg-accent/10 border border-accent/15">
                    IA
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}
