'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  placeId: string
}

export default function CreateProjectButton({ placeId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(placeId)}/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      )
      if (res.ok) {
        router.refresh()
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
    <div className="bg-card border border-border rounded-xl p-4">
      <h2 className="text-xs font-semibold text-text uppercase tracking-wide mb-3">
        Projeto
      </h2>
      <button
        onClick={handleCreate}
        disabled={loading}
        className="w-full py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
      >
        {loading ? 'Criando…' : 'Criar projeto'}
      </button>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
