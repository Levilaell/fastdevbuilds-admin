'use client'

import { useState } from 'react'
import type { Conversation } from '@/lib/types'

interface ReplyBoxProps {
  placeId: string
  onNewMessage: (conv: Conversation) => void
}

export default function ReplyBox({ placeId, onNewMessage }: ReplyBoxProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const channel = 'whatsapp' as const

  async function handleSuggest() {
    setSuggesting(true)
    try {
      const res = await fetch('/api/conversations/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place_id: placeId }),
      })
      if (res.ok) {
        const data = await res.json()
        setMessage(data.suggestion)
      }
    } finally {
      setSuggesting(false)
    }
  }

  async function handleSend() {
    if (!message.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/conversations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place_id: placeId, message: message.trim(), channel }),
      })
      if (res.ok) {
        const conv = await res.json()
        onNewMessage(conv)
        setMessage('')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border-t border-border p-4 space-y-3">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Escreva sua mensagem…"
        rows={3}
        className="w-full px-3 py-2 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent resize-y min-h-[72px]"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
            WhatsApp
          </span>
          <button
            onClick={handleSuggest}
            disabled={suggesting}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            {suggesting ? 'Gerando…' : 'Sugerir com IA'}
          </button>
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
        >
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
