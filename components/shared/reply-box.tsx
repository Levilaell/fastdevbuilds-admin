'use client'

import { useState } from 'react'
import type { Conversation } from '@/lib/types'

interface ReplyBoxProps {
  placeId: string
  onNewMessage: (conv: Conversation) => void
  /** If true, show phone input prompt when lead has no phone */
  enablePhonePrompt?: boolean
  /** Channel for sending — defaults to 'whatsapp' */
  channel?: 'whatsapp' | 'email' | 'sms'
}

export default function ReplyBox({ placeId, onNewMessage, enablePhonePrompt, channel = 'whatsapp' }: ReplyBoxProps) {
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [sending, setSending] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [sendError, setSendError] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [needsPhone, setNeedsPhone] = useState(false)
  const [sent, setSent] = useState(false)
  const isEmail = channel === 'email'
  const isSms = channel === 'sms'

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
        if (data.suggestion) setMessage(data.suggestion)
      }
    } finally {
      setSuggesting(false)
    }
  }

  async function handleSavePhone() {
    if (!phoneInput.trim()) return
    const digits = phoneInput.trim().replace(/\D/g, '')
    if (digits.length < 10) {
      setSendError('Telefone invalido — minimo 10 digitos')
      return
    }
    const res = await fetch(`/api/leads/${encodeURIComponent(placeId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits }),
    })
    if (res.ok) {
      setNeedsPhone(false)
      setSendError('')
      handleSend()
    }
  }

  async function handleSend() {
    if (!message.trim()) return
    setSending(true)
    setSendError('')
    try {
      const res = await fetch('/api/conversations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          place_id: placeId,
          message: message.trim(),
          channel,
          ...(isEmail && subject.trim() ? { subject: subject.trim() } : {}),
        }),
      })
      if (res.ok) {
        const conv = await res.json()
        onNewMessage(conv)
        setMessage('')
        setNeedsPhone(false)
        setSent(true)
        setTimeout(() => setSent(false), 2000)
      } else {
        const data = await res.json().catch(() => ({ error: 'Erro ao enviar' }))
        if (enablePhonePrompt && data.error?.includes('telefone')) {
          setNeedsPhone(true)
        } else {
          setSendError(data.error ?? 'Erro ao enviar mensagem')
        }
      }
    } finally {
      setSending(false)
      setConfirming(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && message.trim()) {
      e.preventDefault()
      if (confirming) handleSend()
      else setConfirming(true)
    }
  }

  return (
    <div className="border-t border-border p-4 space-y-3">
      {isEmail && (
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject line..."
          className="w-full px-3 py-2 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
      )}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isEmail ? 'Write your reply... (Ctrl+Enter to send)' : 'Escreva sua mensagem... (Ctrl+Enter para enviar)'}
        rows={3}
        className="w-full px-3 py-2 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent resize-y min-h-[72px]"
      />

      {/* Confirmation bar */}
      {confirming && (
        <div className="flex items-center justify-between gap-2 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
          <span className="text-xs text-warning">Confirmar envio desta mensagem?</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={sending}
              className="px-3 py-1 text-xs rounded-lg border border-border text-muted hover:text-text disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-3 py-1 text-xs rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
            >
              {sending ? 'Enviando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {/* Phone prompt */}
      {needsPhone && (
        <div className="flex items-center gap-2 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
          <span className="text-xs text-warning shrink-0">Telefone necessario:</span>
          <input
            type="text"
            value={phoneInput}
            onChange={e => setPhoneInput(e.target.value)}
            placeholder="5511999999999"
            className="flex-1 h-7 px-2 text-xs rounded bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={handleSavePhone}
            disabled={!phoneInput.trim()}
            className="px-2 py-1 text-xs rounded bg-accent text-white disabled:opacity-50"
          >
            Salvar e enviar
          </button>
        </div>
      )}

      {/* Success indicator */}
      {sent && (
        <p className="text-xs text-success">Mensagem enviada</p>
      )}

      {/* Error display */}
      {sendError && !needsPhone && (
        <p className="text-xs text-danger">{sendError}</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
            isEmail
              ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
              : isSms
              ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
              : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
          }`}>
            {isEmail ? 'Email' : isSms ? 'SMS' : 'WhatsApp'}
          </span>
          <button
            onClick={handleSuggest}
            disabled={suggesting || confirming}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            {suggesting ? 'Gerando…' : 'Sugerir com IA'}
          </button>
        </div>

        <button
          onClick={() => setConfirming(true)}
          disabled={sending || !message.trim() || confirming}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
