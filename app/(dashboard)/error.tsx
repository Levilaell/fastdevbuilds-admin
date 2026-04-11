'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
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
      <p className="text-sm font-medium text-text">Algo deu errado</p>
      <p className="text-xs mt-1 max-w-md text-center">{error.message}</p>
      <button
        onClick={reset}
        className="mt-4 px-4 py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white"
      >
        Tentar novamente
      </button>
    </div>
  )
}
