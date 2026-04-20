'use client'

import { useEffect, useState } from 'react'

const REASONS: { value: string; label: string }[] = [
  { value: 'not_responded', label: 'Não respondeu' },
  { value: 'refused', label: 'Recusou a proposta' },
  { value: 'price', label: 'Preço alto' },
  { value: 'competitor', label: 'Escolheu concorrente' },
  { value: 'other', label: 'Outro' },
]

interface Props {
  placeId: string
  businessName: string
  onClose: () => void
  onMarked: () => void
}

export default function MarkLostModal({
  placeId,
  businessName,
  onClose,
  onMarked,
}: Props) {
  const [reason, setReason] = useState(REASONS[0].value)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, onClose])

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/leads/${encodeURIComponent(placeId)}/mark-lost`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      )
      if (res.ok) {
        onMarked()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Erro ao marcar como lost')
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => {
        if (!loading) onClose()
      }}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text">
            Marcar como lost — {businessName}
          </h2>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">Motivo</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
              className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-danger disabled:opacity-50"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-muted leading-relaxed">
            O lead será movido para lost. O projeto (se houver) permanece
            preservado caso você precise consultar depois.
          </p>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-text hover:bg-sidebar disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-danger hover:bg-danger/80 text-white disabled:opacity-50"
          >
            {loading ? 'Marcando…' : 'Marcar como lost'}
          </button>
        </div>
      </div>
    </div>
  )
}
