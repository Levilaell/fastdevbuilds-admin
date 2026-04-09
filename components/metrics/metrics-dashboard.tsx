'use client'

import { useState, useCallback } from 'react'
import type { MetricsData } from '@/lib/metrics'
import { STATUS_LABELS, type LeadStatus } from '@/lib/types'

const PERIODS = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'all', label: 'Tudo' },
] as const

const FUNNEL_COLORS: Record<string, { bar: string; text: string }> = {
  prospected: { bar: 'bg-slate-500', text: 'text-slate-400' },
  sent: { bar: 'bg-blue-500', text: 'text-blue-400' },
  replied: { bar: 'bg-yellow-500', text: 'text-yellow-400' },
  negotiating: { bar: 'bg-orange-500', text: 'text-orange-400' },
  scoped: { bar: 'bg-purple-500', text: 'text-purple-400' },
  closed: { bar: 'bg-green-500', text: 'text-green-400' },
}

const fmtNumber = new Intl.NumberFormat('pt-BR')
const fmtCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function fmtPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

interface Props {
  initialData: MetricsData
}

export default function MetricsDashboard({ initialData }: Props) {
  const [period, setPeriod] = useState('all')
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(false)

  const changePeriod = useCallback(async (newPeriod: string) => {
    setPeriod(newPeriod)
    setLoading(true)
    try {
      const res = await fetch(`/api/metrics?period=${newPeriod}`)
      if (res.ok) {
        const json: MetricsData = await res.json()
        setData(json)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const { summary, funnel, revenue, topNiches, topCities } = data
  const maxFunnel = Math.max(...funnel.map(f => f.count), 1)
  const baseCount = funnel[0]?.count ?? 0
  const maxNiche = topNiches[0]?.count ?? 1
  const maxCity = topCities[0]?.count ?? 1
  const hasData = summary.totalLeads > 0 || revenue.totalPaid > 0

  if (!hasData && !loading) {
    return (
      <div className="px-6 pt-6">
        <h1 className="text-2xl font-semibold text-text mb-6">Métricas</h1>
        <div className="flex flex-col items-center justify-center py-24 text-muted">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mb-4 opacity-30"
          >
            <path d="M3 3v18h18" />
            <path d="M7 16l4-8 4 4 4-6" />
          </svg>
          <p className="text-sm font-medium">Nenhum dado ainda</p>
          <p className="text-xs mt-1">Rode o bot para começar a prospectar</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`px-6 pt-6 pb-10 space-y-6 ${loading ? 'opacity-60 pointer-events-none' : ''}`}
    >
      {/* Header + Period Toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Métricas</h1>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => changePeriod(p.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                period === p.key
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-text'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          label="Total Leads"
          value={fmtNumber.format(summary.totalLeads)}
        />
        <SummaryCard
          label="Taxa Resposta"
          value={fmtPercent(summary.responseRate)}
        />
        <SummaryCard
          label="Em Negociação"
          value={fmtNumber.format(summary.negotiating)}
        />
        <SummaryCard
          label="Receita Total"
          value={fmtCurrency.format(summary.totalRevenue)}
        />
      </div>

      {/* Funnel + Revenue */}
      <div className="grid grid-cols-2 gap-4">
        {/* Conversion Funnel */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text mb-4">
            Funil de Conversão
          </h2>
          <div className="space-y-3">
            {funnel.map((step, i) => {
              const pct = baseCount > 0 ? step.count / baseCount : 0
              const colors = FUNNEL_COLORS[step.status]
              return (
                <div key={step.status}>
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-medium ${colors?.text ?? 'text-muted'}`}
                    >
                      {STATUS_LABELS[step.status as LeadStatus] ?? step.status}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-text">
                        {step.count}
                      </span>
                      <span className="text-[10px] text-muted w-10 text-right">
                        {i === 0 ? '100%' : fmtPercent(pct)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colors?.bar ?? 'bg-muted'}`}
                      style={{
                        width: `${Math.max((step.count / maxFunnel) * 100, step.count > 0 ? 2 : 0)}%`,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Revenue */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text mb-4">Receita</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
                Total Paga
              </p>
              <p className="text-lg font-semibold text-success">
                {fmtCurrency.format(revenue.totalPaid)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
                Pendente
              </p>
              <p className="text-lg font-semibold text-warning">
                {fmtCurrency.format(revenue.totalPending)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
                Ticket Médio
              </p>
              <p className="text-lg font-semibold text-text">
                {fmtCurrency.format(revenue.avgTicket)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
                Fechados (mês)
              </p>
              <p className="text-lg font-semibold text-text">
                {revenue.closedThisMonth}
                {revenue.closedLastMonth > 0 && (
                  <span className="text-xs text-muted ml-1">
                    vs {revenue.closedLastMonth} ant.
                  </span>
                )}
              </p>
            </div>
          </div>

          {revenue.recentProjects.length > 0 && (
            <div className="border-t border-border pt-3 mt-3">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-2">
                Últimos Projetos
              </p>
              <div className="space-y-2">
                {revenue.recentProjects.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-text truncate max-w-[60%]">
                      {p.business_name}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-success">
                        {fmtCurrency.format(p.price)}
                      </span>
                      <span className="text-[10px] text-muted">
                        {new Date(p.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Niches + Cities */}
      <div className="grid grid-cols-2 gap-4">
        <BarChartCard
          title="Leads por Nicho"
          items={topNiches}
          max={maxNiche}
        />
        <BarChartCard
          title="Leads por Cidade"
          items={topCities}
          max={maxCity}
        />
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
        {label}
      </p>
      <p className="text-2xl font-semibold text-text">{value}</p>
    </div>
  )
}

function BarChartCard({
  title,
  items,
  max,
}: {
  title: string
  items: { name: string; count: number }[]
  max: number
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-text mb-4">{title}</h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted">Sem dados</p>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text truncate max-w-[70%]">
                  {item.name}
                </span>
                <span className="text-xs font-mono text-muted">
                  {item.count}
                </span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function MetricsSkeleton() {
  return (
    <div className="px-6 pt-6 pb-10 space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 bg-border rounded w-32" />
        <div className="h-9 bg-border rounded w-56" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4">
            <div className="h-3 bg-border rounded w-20 mb-2" />
            <div className="h-7 bg-border rounded w-28" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="h-4 bg-border rounded w-36 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <div className="h-3 bg-border rounded w-20" />
                  <div className="h-3 bg-border rounded w-12" />
                </div>
                <div className="h-2 bg-border rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="h-4 bg-border rounded w-20 mb-4" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="h-2 bg-border rounded w-16 mb-1" />
                <div className="h-6 bg-border rounded w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5">
            <div className="h-4 bg-border rounded w-28 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j}>
                  <div className="flex justify-between mb-1">
                    <div className="h-3 bg-border rounded w-32" />
                    <div className="h-3 bg-border rounded w-8" />
                  </div>
                  <div className="h-2 bg-border rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
