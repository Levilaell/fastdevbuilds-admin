'use client'

interface PipelineFiltersProps {
  search: string
  onSearchChange: (v: string) => void
  channel: string
  onChannelChange: (v: string) => void
  minScore: number
  onMinScoreChange: (v: number) => void
  niche: string
  onNicheChange: (v: string) => void
  niches: string[]
  showArchived: boolean
  onShowArchivedChange: (v: boolean) => void
  archivedCount: number
}

export default function PipelineFilters({
  search,
  onSearchChange,
  channel,
  onChannelChange,
  minScore,
  onMinScoreChange,
  niche,
  onNicheChange,
  niches,
  showArchived,
  onShowArchivedChange,
  archivedCount,
}: PipelineFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Buscar negócio…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 pl-8 pr-3 text-xs rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent w-48"
        />
      </div>

      {/* Channel */}
      <select
        value={channel}
        onChange={(e) => onChannelChange(e.target.value)}
        className="h-8 px-2.5 text-xs rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <option value="">Todos canais</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="email">Email</option>
      </select>

      {/* Min score */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted whitespace-nowrap">Dor min:</label>
        <input
          type="range"
          min={0}
          max={10}
          value={minScore}
          onChange={(e) => onMinScoreChange(Number(e.target.value))}
          className="w-20 accent-accent"
        />
        <span className="text-xs text-muted tabular-nums w-4">{minScore}</span>
      </div>

      {/* Niche */}
      {niches.length > 0 && (
        <select
          value={niche}
          onChange={(e) => onNicheChange(e.target.value)}
          className="h-8 px-2.5 text-xs rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent max-w-[180px]"
        >
          <option value="">Todos nichos</option>
          {niches.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      )}

      {/* Archived toggle */}
      <button
        onClick={() => onShowArchivedChange(!showArchived)}
        className={`h-8 px-3 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${
          showArchived
            ? 'bg-accent/10 border-accent/30 text-accent'
            : 'bg-sidebar border-border text-muted hover:text-text'
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="21 8 21 21 3 21 3 8" />
          <rect x="1" y="3" width="22" height="5" />
          <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
        Arquivados
        {archivedCount > 0 && (
          <span className={`text-[10px] px-1 py-0.5 rounded ${showArchived ? 'bg-accent/20' : 'bg-border'}`}>
            {archivedCount}
          </span>
        )}
      </button>
    </div>
  )
}
