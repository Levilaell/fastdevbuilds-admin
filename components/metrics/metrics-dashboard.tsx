'use client'

import { useState, useCallback, useEffect } from 'react'
import type { MetricsData, SegmentRow } from '@/lib/metrics'

const PERIODS = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'all', label: 'Tudo' },
] as const

const fmtNumber = new Intl.NumberFormat('pt-BR')
const fmtCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function fmtPercent(v: number): string {
  if (!isFinite(v) || v === 0) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function fmtMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleString('pt-BR', { month: 'short' }).replace('.', '')
}

// ─── Skeleton ───

export function MetricsSkeleton() {
  return (
    <div className="px-3 sm:px-6 pt-6 pb-10 space-y-6">
      <div className="h-8 w-32 bg-border rounded animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="h-80 bg-card border border-border rounded-xl animate-pulse" />
    </div>
  )
}

// ─── KPI card ───

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'success' | 'accent' | 'warning'
}) {
  const accentClass =
    accent === 'success'
      ? 'text-success'
      : accent === 'warning'
        ? 'text-warning'
        : accent === 'accent'
          ? 'text-accent'
          : 'text-text'

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-[11px] text-muted uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-1 ${accentClass}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted mt-1">{sub}</p>}
    </div>
  )
}

// ─── Funnel row ───

function FunnelRow({
  label,
  count,
  rate,
  baseCount,
  color,
}: {
  label: string
  count: number
  rate: number | null
  baseCount: number
  color: string
}) {
  const pct = baseCount > 0 ? count / baseCount : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-text/90">{label}</span>
        <span className="tabular-nums text-text/80">
          {fmtNumber.format(count)}
          {rate !== null && (
            <span className="text-muted ml-2 text-[11px]">
              {fmtPercent(rate)} vs etapa anterior
            </span>
          )}
        </span>
      </div>
      <div className="h-2 bg-border/50 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${Math.max(pct * 100, count > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  )
}

// ─── Segmentation table ───

function SegmentTable({ rows }: { rows: SegmentRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted text-center py-8">
        Sem dados pra mostrar neste período
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted border-b border-border">
            <th className="text-left font-normal py-2 px-2">Segmento</th>
            <th className="text-right font-normal py-2 px-2">Enviados</th>
            <th className="text-right font-normal py-2 px-2">Resposta</th>
            <th className="text-right font-normal py-2 px-2">Aceitação</th>
            <th className="text-right font-normal py-2 px-2">Fechamento</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-border/50 hover:bg-sidebar/30">
              <td className="py-2 px-2 text-text truncate max-w-[200px]">{r.name}</td>
              <td className="py-2 px-2 text-right tabular-nums text-text/80">
                {fmtNumber.format(r.sent)}
              </td>
              <td className="py-2 px-2 text-right tabular-nums">
                <span className="text-text">{fmtPercent(r.responseRate)}</span>
                <span className="text-muted text-[10px] ml-1">
                  ({r.replied})
                </span>
              </td>
              <td className="py-2 px-2 text-right tabular-nums">
                <span className="text-text">{fmtPercent(r.acceptanceRate)}</span>
                <span className="text-muted text-[10px] ml-1">
                  ({r.accepted})
                </span>
              </td>
              <td className="py-2 px-2 text-right tabular-nums">
                <span className="text-success">{fmtPercent(r.closeRate)}</span>
                <span className="text-muted text-[10px] ml-1">({r.paid})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main ───

interface Props {
  initialData: MetricsData
}

type SegmentTab = 'niche' | 'city' | 'instance' | 'channel'

const SEGMENT_TABS: { key: SegmentTab; label: string }[] = [
  { key: 'niche', label: 'Nicho' },
  { key: 'city', label: 'Cidade' },
  { key: 'instance', label: 'Instance' },
  { key: 'channel', label: 'Canal' },
]

export default function MetricsDashboard({ initialData }: Props) {
  const [period, setPeriod] = useState('all')
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(false)
  const [segmentTab, setSegmentTab] = useState<SegmentTab>('niche')

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

  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.visibilityState === 'hidden') return
      const res = await fetch(`/api/metrics?period=${period}`)
      if (res.ok) {
        const json: MetricsData = await res.json()
        setData(json)
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [period])

  const { cohortSize, funnel, rates, revenue } = data
  const hasData = cohortSize > 0 || revenue.paidCount > 0

  const segmentRows =
    segmentTab === 'niche'
      ? data.byNiche
      : segmentTab === 'city'
        ? data.byCity
        : segmentTab === 'instance'
          ? data.byInstance
          : data.byChannel

  const maxMonthly = Math.max(...revenue.monthlyTrend.map((m) => m.revenue), 1)

  return (
    <div className="px-3 sm:px-6 pt-6 pb-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Métricas</h1>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => changePeriod(p.key)}
              disabled={loading}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                period === p.key
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-text'
              } disabled:opacity-50`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData && !loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted">
          <p className="text-sm font-medium">Nenhum dado ainda</p>
          <p className="text-xs mt-1">Rode o bot pra começar a prospectar</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Enviados no período"
              value={fmtNumber.format(cohortSize)}
              sub={`${fmtNumber.format(funnel.replied)} responderam`}
            />
            <KpiCard
              label="Taxa de resposta"
              value={fmtPercent(rates.replied_vs_sent)}
              sub={`${fmtNumber.format(funnel.replied)} de ${fmtNumber.format(funnel.sent)}`}
              accent="accent"
            />
            <KpiCard
              label="Conversão final"
              value={fmtPercent(rates.overall_sent_to_paid)}
              sub={`${fmtNumber.format(funnel.paid)} pagos do cohort`}
              accent="success"
            />
            <KpiCard
              label="Receita este mês"
              value={fmtCurrency.format(revenue.thisMonth)}
              sub={`Mês passado: ${fmtCurrency.format(revenue.lastMonth)}`}
              accent="success"
            />
          </div>

          {/* Funil */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text">Funil de conversão</h2>
              <span className="text-[11px] text-muted">
                cohort: leads enviados no período
              </span>
            </div>

            {funnel.sent === 0 ? (
              <p className="text-xs text-muted text-center py-6">
                Sem envios no período
              </p>
            ) : (
              <div className="space-y-3">
                <FunnelRow
                  label="Enviados"
                  count={funnel.sent}
                  rate={null}
                  baseCount={funnel.sent}
                  color="bg-blue-500/70"
                />
                <FunnelRow
                  label="Responderam"
                  count={funnel.replied}
                  rate={rates.replied_vs_sent}
                  baseCount={funnel.sent}
                  color="bg-yellow-500/70"
                />
                <FunnelRow
                  label="Aceitaram"
                  count={funnel.accepted}
                  rate={rates.accepted_vs_replied}
                  baseCount={funnel.sent}
                  color="bg-orange-500/70"
                />
                <FunnelRow
                  label="Preview enviado"
                  count={funnel.preview_sent}
                  rate={rates.preview_vs_accepted}
                  baseCount={funnel.sent}
                  color="bg-violet-500/70"
                />
                <FunnelRow
                  label="Ajustando"
                  count={funnel.adjusting}
                  rate={rates.adjusting_vs_preview}
                  baseCount={funnel.sent}
                  color="bg-fuchsia-500/70"
                />
                <FunnelRow
                  label="Versão final enviada"
                  count={funnel.delivered}
                  rate={rates.delivered_vs_adjusting}
                  baseCount={funnel.sent}
                  color="bg-emerald-500/70"
                />
                <FunnelRow
                  label="Pagos"
                  count={funnel.paid}
                  rate={rates.paid_vs_delivered}
                  baseCount={funnel.sent}
                  color="bg-green-500"
                />
              </div>
            )}
          </div>

          {/* Segmentação */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="text-sm font-semibold text-text">Segmentação</h2>
              <div className="flex gap-1 bg-sidebar border border-border rounded-lg p-0.5">
                {SEGMENT_TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setSegmentTab(t.key)}
                    className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                      segmentTab === t.key
                        ? 'bg-accent text-white'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <SegmentTable rows={segmentRows} />
          </div>

          {/* Receita */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-text">Receita</h2>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                label="Total recebido"
                value={fmtCurrency.format(revenue.totalPaid)}
                sub={`${fmtNumber.format(revenue.paidCount)} projetos pagos`}
              />
              <KpiCard
                label="Ticket médio"
                value={fmtCurrency.format(revenue.avgTicket)}
              />
              <KpiCard
                label="Projetos pendentes"
                value={fmtNumber.format(revenue.pendingCount)}
                sub="aguardando conclusão ou pagamento"
              />
              <KpiCard
                label="Este mês vs anterior"
                value={fmtCurrency.format(revenue.thisMonth)}
                sub={`Anterior: ${fmtCurrency.format(revenue.lastMonth)}`}
              />
            </div>

            {/* Monthly trend bar chart */}
            <div>
              <p className="text-[11px] text-muted uppercase tracking-wide mb-2">
                Últimos 6 meses
              </p>
              <div className="flex items-end justify-between gap-2 h-32">
                {revenue.monthlyTrend.map((m) => {
                  const h = maxMonthly > 0 ? (m.revenue / maxMonthly) * 100 : 0
                  return (
                    <div
                      key={m.month}
                      className="flex-1 flex flex-col items-center gap-1"
                      title={`${fmtMonthLabel(m.month)}: ${fmtCurrency.format(m.revenue)} (${m.count} projeto${m.count === 1 ? '' : 's'})`}
                    >
                      <div className="w-full flex-1 flex items-end">
                        <div
                          className="w-full bg-accent/60 rounded-t"
                          style={{ height: `${Math.max(h, m.revenue > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted tabular-nums">
                        {fmtMonthLabel(m.month)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Recent paid */}
            {revenue.recentPaid.length > 0 && (
              <div>
                <p className="text-[11px] text-muted uppercase tracking-wide mb-2">
                  Últimos pagamentos
                </p>
                <ul className="divide-y divide-border/50">
                  {revenue.recentPaid.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between py-2 text-xs"
                    >
                      <span className="text-text truncate">{r.business_name}</span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-success tabular-nums">
                          {fmtCurrency.format(r.price)}
                        </span>
                        <span className="text-muted text-[10px] tabular-nums">
                          {new Date(r.paid_at).toLocaleDateString('pt-BR')}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
