'use client'

import { useCallback, useEffect, useState } from 'react'

interface Props {
  placeId: string
  businessName: string
  previewUrl: string
  onClose: () => void
  onSent: () => void
}

export default function SendPreviewModal({
  placeId,
  businessName,
  previewUrl,
  onClose,
  onSent,
}: Props) {
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const busy = generating || sending

  const generate = useCallback(async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(placeId)}/send-preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preview_url: previewUrl }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (res.ok && typeof data.message === 'string') {
        setMessage(data.message)
      } else {
        setError(data.error ?? 'Erro ao gerar mensagem')
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setGenerating(false)
    }
  }, [placeId, previewUrl])

  useEffect(() => {
    generate()
  }, [generate])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function handleSend() {
    if (!message.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/conversations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          place_id: placeId,
          message: message.trim(),
          channel: 'whatsapp',
        }),
      })
      if (res.ok) {
        onSent()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Erro ao enviar mensagem')
        setSending(false)
      }
    } catch {
      setError('Erro de conexão')
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        className="w-full max-w-lg bg-card border border-border rounded-xl shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text">
            Enviar preview para {businessName}
          </h2>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-sidebar border border-border rounded-lg p-3">
            <p className="text-xs text-muted leading-relaxed break-all">
              <span className="text-text/80 font-medium">Preview URL:</span> {previewUrl}
            </p>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">
              Mensagem (editável antes de enviar)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={busy}
              placeholder={generating ? 'Gerando mensagem…' : ''}
              rows={6}
              className="w-full px-3 py-2 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 resize-none font-mono"
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[11px] text-muted">
                {generating
                  ? 'Aguarde a geração…'
                  : 'Revise, edite se necessário e envie.'}
              </p>
              <button
                type="button"
                onClick={generate}
                disabled={busy}
                className="text-[11px] text-muted hover:text-text disabled:opacity-50 underline-offset-2 hover:underline"
              >
                Regenerar
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-text hover:bg-sidebar disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !message.trim()}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
          >
            {sending ? 'Enviando…' : 'Enviar pelo WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  )
}
