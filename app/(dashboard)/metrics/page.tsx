import { Suspense } from 'react'
import { fetchMetrics } from '@/lib/metrics'
import MetricsDashboard, {
  MetricsSkeleton,
} from '@/components/metrics/metrics-dashboard'

async function MetricsData() {
  try {
    const data = await fetchMetrics('all')
    return <MetricsDashboard initialData={data} />
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mb-3 opacity-40"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-sm">Erro ao carregar métricas</p>
        <p className="text-xs mt-1">{message}</p>
      </div>
    )
  }
}

export default function MetricsPage() {
  return (
    <Suspense fallback={<MetricsSkeleton />}>
      <MetricsData />
    </Suspense>
  )
}
