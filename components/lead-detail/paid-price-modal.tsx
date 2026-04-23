'use client'

import { useEffect, useState } from 'react'

/**
 * Ask for the final paid price before flipping project.status → paid.
 * Intercepts both entry points (lead detail + inbox) so revenue metrics
 * always have a real amount — no more `price=null` paid rows.
 */

interface Props {
  placeId: string
  businessName: string
  onClose: () => void
  onPaid: () => void
}

export default function PaidPriceModal({
  placeId,
  businessName,
  onClose,
  onPaid,
}: Props) {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loading, onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(amount.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      setError('Valor inválido')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(placeId)}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'paid', price: n }),
        },
      )
      if (res.ok) {
        onPaid()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Erro ao marcar como pago')
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
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text">
            Cliente pagou — {businessName}
          </h2>
          <p className="text-[11px] text-muted mt-1">
            Informe o valor final pra entrar nas métricas de receita.
          </p>
        </div>

        <div className="p-5 space-y-3">
          <label className="block">
            <span className="block text-xs text-muted mb-1.5">Valor recebido (R$)</span>
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              placeholder="1200"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={loading}
              className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
          </label>
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
            type="submit"
            disabled={loading || !amount}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-success hover:bg-success/80 text-white disabled:opacity-50"
          >
            {loading ? 'Salvando…' : 'Confirmar pago'}
          </button>
        </div>
      </form>
    </div>
  )
}
