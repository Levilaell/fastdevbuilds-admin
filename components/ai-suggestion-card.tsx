'use client'

import { useState } from 'react'
import { INTENT_COLORS, INTENT_LABELS, type AiSuggestion, type Conversation } from '@/lib/types'

interface Props {
  suggestion: AiSuggestion
  onDismiss: () => void
  onSent?: (conv: Conversation) => void
}

export default function AiSuggestionCard({ suggestion, onDismiss, onSent }: Props) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(suggestion.suggested_reply)
  const [loading, setLoading] = useState(false)
  const [needsPhone, setNeedsPhone] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [error, setError] = useState('')

  const intentColor = INTENT_COLORS[suggestion.intent] ?? INTENT_COLORS.other
  const intentLabel = INTENT_LABELS[suggestion.intent] ?? suggestion.intent

  async function handleApprove() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/ai-suggestions/${suggestion.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          text !== suggestion.suggested_reply ? { edited_reply: text } : {},
        ),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.conversation && onSent) onSent(data.conversation)
        onDismiss()
      } else {
        const data = await res.json()
        if (data.error?.includes('telefone')) {
          setNeedsPhone(true)
        } else {
          setError(data.error ?? 'Erro ao enviar')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSavePhoneAndApprove() {
    if (!phoneInput.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(suggestion.place_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput.trim() }),
      })
      if (res.ok) {
        setNeedsPhone(false)
        await handleApprove()
      } else {
        setError('Erro ao salvar telefone')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleReject() {
    setLoading(true)
    try {
      await fetch(`/api/ai-suggestions/${suggestion.id}/reject`, {
        method: 'POST',
      })
      onDismiss()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-4 mb-3 bg-card border border-accent/20 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-accent font-medium">Sugestão automática</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${intentColor}`}>
            {intentLabel}
          </span>
          <span className="text-[10px] text-muted">
            {Math.round(suggestion.confidence * 100)}%
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {editing ? (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent resize-y"
          />
        ) : (
          <p className="text-sm text-text/90 whitespace-pre-wrap">{text}</p>
        )}
      </div>

      {/* Phone input when needed */}
      {needsPhone && (
        <div className="flex items-center gap-2 mx-4 mb-3 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
          <span className="text-xs text-warning shrink-0">Telefone:</span>
          <input
            type="text"
            value={phoneInput}
            onChange={e => setPhoneInput(e.target.value)}
            placeholder="5511999999999"
            className="flex-1 h-7 px-2 text-xs rounded bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={handleSavePhoneAndApprove}
            disabled={loading || !phoneInput.trim()}
            className="px-2 py-1 text-xs rounded bg-accent text-white disabled:opacity-50"
          >
            {loading ? '…' : 'Salvar e enviar'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && !needsPhone && (
        <p className="text-xs text-danger px-4 pb-2">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border">
        <button
          onClick={() => setEditing(!editing)}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-text disabled:opacity-50"
        >
          {editing ? 'Pronto' : 'Editar'}
        </button>
        <button
          onClick={handleReject}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded-lg border border-danger/30 text-danger hover:bg-danger/10 disabled:opacity-50"
        >
          Rejeitar
        </button>
        <button
          onClick={handleApprove}
          disabled={loading || needsPhone}
          className="px-3 py-1.5 text-xs rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50 ml-auto"
        >
          {loading ? 'Enviando…' : 'Aprovar e Enviar'}
        </button>
      </div>
    </div>
  )
}
