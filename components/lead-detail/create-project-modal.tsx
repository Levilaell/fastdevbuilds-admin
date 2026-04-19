'use client'

import { useEffect, useState } from 'react'

interface Props {
  placeId: string
  businessName: string
  onClose: () => void
  onCreated: () => void
}

export default function CreateProjectModal({
  placeId,
  businessName,
  onClose,
  onCreated,
}: Props) {
  const [notes, setNotes] = useState('')
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
        `/api/projects/${encodeURIComponent(placeId)}/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: notes.trim() || undefined }),
        },
      )
      if (res.ok) {
        onCreated()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Erro ao criar projeto')
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
        className="w-full max-w-lg bg-card border border-border rounded-xl shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text">
            Criar projeto para {businessName}
          </h2>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-sidebar border border-border rounded-lg p-3">
            <p className="text-xs text-muted leading-relaxed">
              Dados do lead + últimas 20 mensagens serão incluídos automaticamente
              no prompt. Adicione abaixo apenas observações ou preferências que
              não apareceram na conversa.
            </p>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={loading}
              placeholder="Ex: incluir galeria de fotos, cor preferida verde, não usar inglês..."
              rows={5}
              className="w-full px-3 py-2 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 resize-none"
            />
          </div>

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
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
          >
            {loading ? 'Criando…' : 'Criar projeto'}
          </button>
        </div>
      </div>
    </div>
  )
}
