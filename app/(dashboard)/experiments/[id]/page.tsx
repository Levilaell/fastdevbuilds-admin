'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  EXPERIMENT_STATUS_LABELS,
  type Experiment,
  type ExperimentVariant,
  type ExperimentStatus,
} from '@/lib/types'

interface VariantMetrics {
  variant_id: string
  variant_name: string
  collected: number
  sent: number
  replied: number
  preview_sent: number
  closed: number
  reply_rate: number
  close_rate: number
}

interface DetailPayload {
  experiment: Experiment
  variants: ExperimentVariant[]
  metrics: VariantMetrics[]
}

const STATUS_COLORS: Record<ExperimentStatus, string> = {
  draft: 'bg-slate-500/20 text-slate-400',
  running: 'bg-emerald-500/20 text-emerald-400',
  completed: 'bg-blue-500/20 text-blue-400',
  aborted: 'bg-red-500/20 text-red-400',
}

const NEXT_STATUS: Record<ExperimentStatus, { label: string; status: ExperimentStatus } | null> = {
  draft: { label: 'Iniciar', status: 'running' },
  running: { label: 'Encerrar', status: 'completed' },
  completed: null,
  aborted: null,
}

function formatPct(n: number) {
  if (!Number.isFinite(n) || n === 0) return '0%'
  return `${(n * 100).toFixed(1)}%`
}

export default function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [data, setData] = useState<DetailPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [transitioning, setTransitioning] = useState(false)

  async function fetchDetail() {
    setError('')
    try {
      const res = await fetch(`/api/experiments/${id}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError('Experimento não encontrado')
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const body: DetailPayload = await res.json()
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function transition(newStatus: ExperimentStatus) {
    if (!confirm(`Mudar status para ${EXPERIMENT_STATUS_LABELS[newStatus]}?`)) {
      return
    }
    setTransitioning(true)
    try {
      const res = await fetch(`/api/experiments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      await fetchDetail()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setTransitioning(false)
    }
  }

  async function handleAbort() {
    if (!confirm('Abortar experimento? Não some leads, só marca como abortado.')) {
      return
    }
    setTransitioning(true)
    try {
      const res = await fetch(`/api/experiments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'aborted' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      await fetchDetail()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setTransitioning(false)
    }
  }

  async function runVariant(variantId: string, variantName: string) {
    if (!confirm(`Disparar bot pra variant "${variantName}"?`)) return
    try {
      const res = await fetch(`/api/experiments/${id}/run-variant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_id: variantId, dry_run: false, send: false, limit: 30 }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      const body = await res.json()
      alert(`Bot disparado. botRunId=${body.botRunId}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    }
  }

  async function handleDelete() {
    if (!confirm('Deletar experimento? Variants vão junto. Leads ficam sem tag.')) {
      return
    }
    try {
      const res = await fetch(`/api/experiments/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      router.push('/experiments')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    }
  }

  if (loading) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
        <div className="h-32 bg-card border border-border rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
        <Link href="/experiments" className="text-sm text-accent hover:underline">
          ← Voltar
        </Link>
        <div className="mt-4 text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          {error || 'Não carregou'}
        </div>
      </div>
    )
  }

  const { experiment, variants, metrics } = data
  const next = NEXT_STATUS[experiment.status]
  const canDelete =
    experiment.status === 'draft' || experiment.status === 'aborted'

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link href="/experiments" className="hover:text-text">
          Lab
        </Link>
        <span>/</span>
        <span className="text-text truncate">{experiment.name}</span>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-text">
                {experiment.name}
              </h1>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  STATUS_COLORS[experiment.status]
                }`}
              >
                {EXPERIMENT_STATUS_LABELS[experiment.status]}
              </span>
            </div>
            {experiment.hypothesis && (
              <p className="text-sm text-muted mt-2">
                <span className="font-semibold">Hipótese:</span>{' '}
                {experiment.hypothesis}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {next && (
              <button
                onClick={() => transition(next.status)}
                disabled={transitioning}
                className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
              >
                {next.label}
              </button>
            )}
            {experiment.status === 'running' && (
              <button
                onClick={handleAbort}
                disabled={transitioning}
                className="h-8 px-3 rounded-lg border border-danger/30 text-danger text-xs font-semibold hover:bg-danger/10 disabled:opacity-50"
              >
                Abortar
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                className="h-8 px-3 rounded-lg border border-border text-muted text-xs hover:text-text"
              >
                Deletar
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-text uppercase tracking-wide mb-3">
          Variants ({variants.length})
        </h2>
        <div className="space-y-3">
          {variants.map((variant) => {
            const m = metrics.find((x) => x.variant_id === variant.id)
            return (
              <div
                key={variant.id}
                className="bg-card border border-border rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-text">
                      {variant.name}
                    </h3>
                    <div className="text-[11px] text-muted mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span>nichos: {variant.niches.join(', ') || '—'}</span>
                      <span>cidades: {variant.cities.join(', ') || '—'}</span>
                      <span>target: {variant.target_volume}</span>
                    </div>
                  </div>
                  {experiment.status === 'running' && (
                    <button
                      onClick={() => runVariant(variant.id, variant.name)}
                      className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 shrink-0"
                    >
                      Rodar bot
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-border">
                  <Metric label="Coletados" value={m?.collected ?? 0} />
                  <Metric label="Enviados" value={m?.sent ?? 0} />
                  <Metric label="Respostas" value={m?.replied ?? 0} />
                  <Metric
                    label="Reply rate"
                    value={formatPct(m?.reply_rate ?? 0)}
                    accent
                  />
                  <Metric
                    label="Close rate"
                    value={formatPct(m?.close_rate ?? 0)}
                    accent
                  />
                </div>

                <details className="text-xs">
                  <summary className="cursor-pointer text-muted hover:text-text">
                    Ver mensagem
                  </summary>
                  <pre className="mt-2 p-3 bg-sidebar border border-border rounded text-text font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                    {variant.message_template}
                  </pre>
                </details>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] text-muted uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`text-lg font-semibold tabular-nums mt-0.5 ${
          accent ? 'text-accent' : 'text-text'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
