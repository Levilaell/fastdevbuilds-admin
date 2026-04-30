'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  EXPERIMENT_STATUS_LABELS,
  type Experiment,
} from '@/lib/types'
import NewExperimentForm from '@/components/experiments/new-experiment-form'

const STATUS_COLORS: Record<Experiment['status'], string> = {
  draft: 'bg-slate-500/20 text-slate-400',
  running: 'bg-emerald-500/20 text-emerald-400',
  completed: 'bg-blue-500/20 text-blue-400',
  aborted: 'bg-red-500/20 text-red-400',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  async function fetchExperiments() {
    setError('')
    try {
      const res = await fetch('/api/experiments')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      setExperiments(body.experiments ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExperiments()
  }, [])

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Lab de experimentos</h1>
          <p className="text-sm text-muted mt-1">
            Compare nichos, cidades e copy formalmente. Cada variant taggea
            seus leads pra métricas comparáveis.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90"
          >
            + Novo
          </button>
        )}
      </div>

      {showForm && (
        <NewExperimentForm
          onCreated={() => {
            setShowForm(false)
            fetchExperiments()
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {error && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 bg-card border border-border rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : experiments.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted text-sm">
          Nenhum experimento ainda. Crie o primeiro pra começar a testar.
        </div>
      ) : (
        <div className="space-y-2">
          {experiments.map((exp) => (
            <Link
              key={exp.id}
              href={`/experiments/${exp.id}`}
              className="block bg-card border border-border rounded-xl p-4 hover:bg-card-hover transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-text truncate">
                      {exp.name}
                    </h3>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        STATUS_COLORS[exp.status]
                      }`}
                    >
                      {EXPERIMENT_STATUS_LABELS[exp.status]}
                    </span>
                  </div>
                  {exp.hypothesis && (
                    <p className="text-xs text-muted mt-1 line-clamp-2">
                      {exp.hypothesis}
                    </p>
                  )}
                </div>
                <div className="text-[11px] text-muted text-right shrink-0 tabular-nums">
                  <div>criado {formatDate(exp.created_at)}</div>
                  {exp.started_at && (
                    <div>iniciado {formatDate(exp.started_at)}</div>
                  )}
                  {exp.ended_at && (
                    <div>encerrado {formatDate(exp.ended_at)}</div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
