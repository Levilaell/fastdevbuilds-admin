'use client'

import { useState } from 'react'
import type { Project } from '@/lib/types'

const fmtCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

interface Props {
  project: Project
  placeId: string
  onApproved?: () => void
}

export default function ProposalCard({ project, placeId, onApproved }: Props) {
  const [price, setPrice] = useState(project.price ?? 0)
  const [message, setMessage] = useState(project.proposal_message ?? '')
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || project.status !== 'scoped') return null

  let scopeItems: string[] = []
  try {
    if (project.scope) scopeItems = JSON.parse(project.scope) as string[]
  } catch {
    if (project.scope) scopeItems = [project.scope]
  }

  async function handleApprove() {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(placeId)}/approve-proposal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, price }),
        },
      )
      if (res.ok) onApproved?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-xs font-semibold text-text uppercase tracking-wide">
          Proposta gerada automaticamente
        </h2>
      </div>

      <div className="p-4 space-y-4">
        {/* Scope */}
        {scopeItems.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Escopo</p>
            <ul className="space-y-1">
              {scopeItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-text">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success mt-0.5 shrink-0">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Price (editable) */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Valor</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">R$</span>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(Number(e.target.value))}
              className="w-28 h-8 px-2 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
            />
            <span className="text-xs text-muted">({fmtCurrency.format(price)})</span>
          </div>
        </div>

        {/* WhatsApp preview */}
        {message && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
              Preview da mensagem
            </p>
            <div className="bg-sidebar border border-border rounded-lg p-3 text-xs text-text/80 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {message}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border">
        <button
          onClick={() => setDismissed(true)}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-text disabled:opacity-50"
        >
          Descartar
        </button>
        <button
          onClick={handleApprove}
          disabled={loading || !message}
          className="px-3 py-1.5 text-xs rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
        >
          {loading ? 'Enviando…' : 'Aprovar e Enviar no WhatsApp'}
        </button>
      </div>
    </div>
  )
}
