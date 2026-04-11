'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { timeAgo } from '@/lib/time-ago'
import { NICHES, CITIES_BR, CITIES_US } from '@/lib/bot-config'
import type { BotRun } from '@/lib/types'

// ─── Types ───

interface TermLine {
  text: string
  type: 'info' | 'success' | 'warning' | 'error' | 'accent'
}

interface QueueItem {
  id: string
  niche: string
  city: string
  limit: number
  minScore: number
  lang: 'pt' | 'en'
  exportTarget: 'csv' | 'supabase' | 'both'
  dryRun: boolean
  send: boolean
}

interface Territory {
  niche: string
  city: string
  lead_count: number
  last_run_at: string | null
}

// ─── Helpers ───

function classifyLine(text: string): TermLine['type'] {
  if (text.startsWith('━') || text.includes('━━━')) return 'accent'
  if (text.includes('❌') || text.toLowerCase().includes('error') || text.toLowerCase().includes('failed'))
    return 'error'
  if (text.includes('✅') || text.toLowerCase().includes('completed') || text.toLowerCase().includes('done'))
    return 'success'
  if (text.includes('⚠') || text.toLowerCase().includes('warning') || text.toLowerCase().includes('skip'))
    return 'warning'
  return 'info'
}

const LINE_COLORS: Record<TermLine['type'], string> = {
  info: 'text-[#e0e0e0]',
  success: 'text-emerald-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
  accent: 'text-[#7C3AED]',
}

let nextQueueId = 0
function queueId(): string {
  return `q-${++nextQueueId}-${Date.now()}`
}

// ─── Main component ───

export default function BotClient() {
  // Form state
  const [niche, setNiche] = useState('')
  const [city, setCity] = useState('')
  const [cityQuery, setCityQuery] = useState('')
  const [cityOpen, setCityOpen] = useState(false)
  const [limit, setLimit] = useState(20)
  const [minScore, setMinScore] = useState(4)
  const [lang, setLang] = useState<'pt' | 'en'>('pt')
  const [exportTarget, setExportTarget] = useState<'csv' | 'supabase' | 'both'>('both')
  const [dryRun, setDryRun] = useState(false)
  const [send, setSend] = useState(false)

  // Queue
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [runningIndex, setRunningIndex] = useState<number | null>(null)

  // Territories
  const [territories, setTerritories] = useState<Territory[]>([])
  const [territoryWarning, setTerritoryWarning] = useState<Territory | null>(null)

  // Terminal state
  const [lines, setLines] = useState<TermLine[]>([])
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const terminalRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)

  // History
  const [runs, setRuns] = useState<BotRun[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  // City dropdown ref
  const cityRef = useRef<HTMLDivElement>(null)

  // ─── Computed ───

  const cityList = lang === 'pt' ? CITIES_BR : CITIES_US
  const filteredCities = useMemo(() => {
    if (!cityQuery) return [...cityList]
    const q = cityQuery.toLowerCase()
    return cityList.filter(c => c.toLowerCase().includes(q))
  }, [cityList, cityQuery])

  const running = status === 'running'

  // ─── Fetch territories ───

  const fetchTerritories = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/territories')
      if (res.ok) setTerritories(await res.json())
    } catch { /* ignore */ }
  }, [])

  // ─── Fetch runs ───

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/runs')
      if (res.ok) setRuns(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchTerritories()
    fetchRuns()
  }, [fetchTerritories, fetchRuns])

  // Auto-scroll terminal using requestAnimationFrame
  useEffect(() => {
    if (terminalRef.current) {
      requestAnimationFrame(() => {
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight
        }
      })
    }
  }, [lines.length])

  // Close city dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) {
        setCityOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ─── Territory lookup ───

  function findTerritory(n: string, c: string): Territory | undefined {
    const cityName = c.split(',')[0].trim().toLowerCase()
    return territories.find(
      t => t.niche === n && t.city.toLowerCase() === cityName,
    )
  }

  // ─── Add to queue ───

  function handleAddToQueue() {
    if (!niche.trim() || !city.trim()) return

    const existing = findTerritory(niche.trim(), city.trim())
    if (existing && !territoryWarning) {
      setTerritoryWarning(existing)
      return
    }

    setQueue(prev => [
      ...prev,
      {
        id: queueId(),
        niche: niche.trim(),
        city: city.trim(),
        limit,
        minScore,
        lang,
        exportTarget,
        dryRun,
        send: send && !dryRun,
      },
    ])
    setTerritoryWarning(null)
  }

  function handleRemoveFromQueue(id: string) {
    setQueue(prev => prev.filter(q => q.id !== id))
  }

  // ─── SSE stream runner ───

  async function runItem(item: QueueItem): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const controller = new AbortController()
      abortRef.current = controller

      setLines(prev => [
        ...prev,
        { text: `━━━ ${item.niche} / ${item.city} ━━━`, type: 'accent' },
        {
          text: `$ prospect-bot --niche "${item.niche}" --city "${item.city}" --limit ${item.limit}`,
          type: 'info',
        },
      ])

      fetch('/api/bot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: item.niche,
          city: item.city,
          limit: item.limit,
          min_score: item.minScore,
          lang: item.lang,
          export_target: item.exportTarget,
          dry_run: item.dryRun,
          send: item.send,
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.body) {
            setLines(prev => [...prev, { text: '❌ Sem resposta do servidor', type: 'error' }])
            resolve(false)
            return
          }

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const parts = buffer.split('\n\n')
            buffer = parts.pop() ?? ''

            for (const part of parts) {
              if (!part.startsWith('data: ')) continue
              const payload = part.slice(6)

              if (payload === '[DONE]') {
                resolve(!cancelledRef.current)
                return
              }

              try {
                const parsed = JSON.parse(payload)
                const lineText: string = parsed.line ?? payload
                const lineType: TermLine['type'] = parsed.type ?? classifyLine(lineText)
                setLines(prev => [...prev, { text: lineText, type: lineType }])
              } catch {
                setLines(prev => [...prev, { text: payload, type: classifyLine(payload) }])
              }
            }
          }

          resolve(!cancelledRef.current)
        })
        .catch((err) => {
          if (controller.signal.aborted) {
            resolve(false)
            return
          }
          const msg = err instanceof Error ? err.message : 'Unknown error'
          setLines(prev => [...prev, { text: `❌ ${msg}`, type: 'error' }])
          resolve(false)
        })
    })
  }

  // ─── Run queue ───

  async function handleRunQueue() {
    if (running || queue.length === 0) return

    setStatus('running')
    cancelledRef.current = false
    setLines([])

    for (let i = 0; i < queue.length; i++) {
      if (cancelledRef.current) break
      setRunningIndex(i)
      const ok = await runItem(queue[i])
      if (!ok && cancelledRef.current) break
    }

    setRunningIndex(null)
    setStatus(cancelledRef.current ? 'error' : 'done')
    setQueue([])
    fetchRuns()
    fetchTerritories()
  }

  // ─── Cancel ───

  async function handleCancel() {
    cancelledRef.current = true
    abortRef.current?.abort()
    try {
      await fetch('/api/bot/cancel', { method: 'POST' })
    } catch { /* ignore */ }
    setLines(prev => [...prev, { text: '⚠️ Execução cancelada pelo usuário', type: 'warning' }])
    setStatus('error')
    setRunningIndex(null)
  }

  // ─── Fill form from history ───

  function fillFromRun(run: BotRun) {
    if (run.niche) setNiche(run.niche)
    if (run.city) {
      setCity(run.city)
      setCityQuery(run.city)
    }
    if (run.limit_count) setLimit(run.limit_count)
    if (run.min_score) setMinScore(run.min_score)
    if (run.lang === 'pt' || run.lang === 'en') setLang(run.lang)
    if (run.export_target === 'csv' || run.export_target === 'supabase' || run.export_target === 'both')
      setExportTarget(run.export_target)
    if (run.dry_run !== null) setDryRun(run.dry_run)
    if (run.send !== null) setSend(run.send)
  }

  function showRunLog(run: BotRun) {
    const header: TermLine[] = [
      { text: `━━━ ${run.niche ?? '?'} / ${run.city ?? '?'} ━━━`, type: 'accent' },
      { text: `Status: ${run.status} | Coletados: ${run.collected ?? 0} | Qualificados: ${run.qualified ?? 0} | Enviados: ${run.sent ?? 0} | Duração: ${run.duration_seconds ?? 0}s`, type: 'info' },
    ]
    if (run.log) {
      const logLines: TermLine[] = run.log.split('\n').map(line => ({
        text: line,
        type: line.startsWith('❌') ? 'error' as const
          : line.startsWith('⚠️') ? 'warning' as const
          : line.startsWith('✅') ? 'success' as const
          : 'info' as const,
      }))
      setLines([...header, ...logLines])
    } else {
      setLines([...header, { text: '(log não disponível para esta execução)', type: 'warning' }])
    }
    setStatus('done')
  }

  // ─── City badge ───

  function cityBadge(cityName: string): Territory | undefined {
    const name = cityName.split(',')[0].trim().toLowerCase()
    return territories.find(t => t.city.toLowerCase() === name)
  }

  // ─── Render ───

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* ─── Left Panel ─── */}
      <div className="w-[380px] flex-none border-r border-border overflow-y-auto p-5 space-y-5">
        <h2 className="text-xs font-semibold text-text uppercase tracking-wide">
          Configuração do Bot
        </h2>

        {/* Niche */}
        <div>
          <label className="block text-xs text-muted mb-1.5">Nicho</label>
          <select
            value={niche}
            onChange={e => setNiche(e.target.value)}
            className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Selecione um nicho</option>
            {NICHES.map(group => (
              <optgroup key={group.category} label={group.category}>
                {group.items.map(item => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* City with autocomplete */}
        <div ref={cityRef} className="relative">
          <label className="block text-xs text-muted mb-1.5">Cidade</label>
          <input
            type="text"
            value={cityQuery}
            onChange={e => {
              setCityQuery(e.target.value)
              setCity(e.target.value)
              setCityOpen(true)
            }}
            onFocus={() => setCityOpen(true)}
            placeholder={lang === 'pt' ? 'São Paulo, SP' : 'Miami, FL'}
            className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {cityOpen && filteredCities.length > 0 && (
            <div className="absolute z-40 top-full left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-card border border-border rounded-lg shadow-lg">
              {filteredCities.map(c => {
                const badge = cityBadge(c)
                return (
                  <button
                    key={c}
                    onClick={() => {
                      setCity(c)
                      setCityQuery(c)
                      setCityOpen(false)
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-text hover:bg-card-hover text-left"
                  >
                    <span>{c}</span>
                    {badge && (
                      <span className="text-[10px] text-success flex items-center gap-1 shrink-0 ml-2">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {badge.lead_count} leads · {timeAgo(badge.last_run_at)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Limit + Score */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1.5">Limite</label>
            <input
              type="number"
              min={5}
              max={100}
              value={limit}
              onChange={e => setLimit(Number(e.target.value) || 20)}
              className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Score mín.</label>
            <input
              type="number"
              min={1}
              max={10}
              value={minScore}
              onChange={e => setMinScore(Number(e.target.value) || 4)}
              className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
            />
          </div>
        </div>

        {/* Lang */}
        <div>
          <label className="block text-xs text-muted mb-1.5">Idioma</label>
          <div className="flex rounded-lg border border-border overflow-hidden w-fit">
            {(['pt', 'en'] as const).map(l => (
              <button
                key={l}
                onClick={() => {
                  setLang(l)
                  setCity('')
                  setCityQuery('')
                }}
                className={`px-4 py-1.5 text-xs font-medium ${
                  l !== 'pt' ? 'border-l border-border' : ''
                } ${lang === l ? 'bg-accent/15 text-accent' : 'text-muted bg-sidebar'}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Export */}
        <div>
          <label className="block text-xs text-muted mb-1.5">Export</label>
          <div className="flex gap-2">
            {(['csv', 'supabase', 'both'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setExportTarget(opt)}
                className={`px-3 py-1.5 text-xs rounded-lg border ${
                  exportTarget === opt
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-muted hover:text-text'
                }`}
              >
                {opt === 'csv' ? 'CSV' : opt === 'supabase' ? 'Supabase' : 'Ambos'}
              </button>
            ))}
          </div>
        </div>

        {/* Dry / Send toggles */}
        <div className="flex gap-3">
          <button
            onClick={() => { setDryRun(!dryRun); if (!dryRun) setSend(false) }}
            className={`px-3 py-1.5 text-xs rounded-lg border ${
              dryRun
                ? 'border-warning text-warning bg-warning/10'
                : 'border-border text-muted hover:text-text'
            }`}
          >
            Dry Run
          </button>
          <button
            onClick={() => { if (!dryRun) setSend(!send) }}
            disabled={dryRun}
            className={`px-3 py-1.5 text-xs rounded-lg border disabled:opacity-30 ${
              send && !dryRun
                ? 'border-success text-success bg-success/10'
                : 'border-border text-muted hover:text-text'
            }`}
          >
            Enviar
          </button>
        </div>

        {/* Territory warning */}
        {territoryWarning && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-xs">
            <p className="text-warning font-medium mb-1">Território já prospectado</p>
            <p className="text-muted">
              {territoryWarning.niche} / {territoryWarning.city} — {territoryWarning.lead_count} leads
              {territoryWarning.last_run_at ? ` · ${timeAgo(territoryWarning.last_run_at)}` : ''}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  handleAddToQueue()
                }}
                className="px-2 py-1 text-[11px] rounded border border-warning text-warning hover:bg-warning/20"
              >
                Adicionar mesmo assim
              </button>
              <button
                onClick={() => setTerritoryWarning(null)}
                className="px-2 py-1 text-[11px] rounded border border-border text-muted hover:text-text"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Add to queue button */}
        <button
          onClick={handleAddToQueue}
          disabled={!niche.trim() || !city.trim() || running}
          className="w-full py-2 text-sm font-medium rounded-lg border border-border text-text hover:bg-card-hover disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Adicionar à fila
        </button>

        {/* Queue list */}
        {queue.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Fila ({queue.length})
            </p>
            {queue.map((item, i) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                  runningIndex === i
                    ? 'border-accent bg-accent/5'
                    : 'border-border'
                }`}
              >
                {runningIndex === i && (
                  <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin shrink-0" />
                )}
                <span className="text-text truncate flex-1">
                  {item.niche} / {item.city}
                </span>
                <span className="text-muted shrink-0 font-mono">
                  {item.limit}:{item.minScore}
                </span>
                {!running && (
                  <button
                    onClick={() => handleRemoveFromQueue(item.id)}
                    className="text-muted hover:text-danger shrink-0"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Run / Cancel buttons */}
        <div className="flex gap-2">
          {running ? (
            <button
              onClick={handleCancel}
              className="flex-1 py-2 text-sm font-medium rounded-lg bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20 flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Cancelar
            </button>
          ) : (
            <button
              onClick={handleRunQueue}
              disabled={queue.length === 0}
              className="flex-1 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Rodar Fila ({queue.length})
            </button>
          )}
        </div>

        {/* History (collapsible) */}
        {runs.length > 0 && (
          <div>
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-text w-full"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${historyOpen ? 'rotate-90' : ''}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Últimas execuções
            </button>
            {historyOpen && (
              <div className="mt-2 space-y-1">
                {runs.map(run => {
                  const badge = {
                    running: 'text-blue-400 bg-blue-500/10',
                    completed: 'text-emerald-400 bg-emerald-500/10',
                    failed: 'text-red-400 bg-red-500/10',
                  }[run.status]
                  return (
                    <div
                      key={run.id}
                      className="flex items-center gap-1 px-2 py-1.5 rounded text-xs hover:bg-card-hover group/run"
                    >
                      <button
                        onClick={() => showRunLog(run)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        title="Ver log"
                      >
                        <span className={`px-1 py-0.5 rounded text-[10px] shrink-0 ${badge}`}>
                          {run.status}
                        </span>
                        <span className="text-text truncate flex-1">
                          {run.niche ?? '—'} / {run.city ?? '—'}
                        </span>
                        <span className="text-muted shrink-0">{timeAgo(run.started_at)}</span>
                      </button>
                      <button
                        onClick={() => fillFromRun(run)}
                        title="Reusar parâmetros"
                        className="p-0.5 rounded text-muted hover:text-accent opacity-0 group-hover/run:opacity-100 transition-opacity shrink-0"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1 4 1 10 7 10" />
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Terminal (right panel) ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Terminal header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-[#0a0a0a] shrink-0">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-xs text-muted font-mono ml-1">prospect-bot</span>
          {running && (
            <span className="text-[11px] text-emerald-400 font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 ml-auto">
              running
            </span>
          )}
          {status === 'done' && (
            <span className="text-[11px] text-emerald-400 font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 ml-auto">
              done
            </span>
          )}
          {status === 'error' && (
            <span className="text-[11px] text-red-400 font-mono px-1.5 py-0.5 rounded bg-red-500/10 ml-auto">
              error
            </span>
          )}
        </div>

        {/* Terminal body */}
        <div
          ref={terminalRef}
          className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed bg-[#000]"
        >
          {lines.length === 0 && status === 'idle' && (
            <div className="text-muted/40 flex items-center gap-1">
              <span>$</span>
              <span className="animate-[pulse_1s_steps(1)_infinite]">_</span>
            </div>
          )}

          {lines.map((line, i) => (
            <div key={i} className={LINE_COLORS[line.type]}>
              {line.text}
            </div>
          ))}

          {running && (
            <div className="text-muted/40 mt-1 flex items-center gap-1">
              <span className="animate-[pulse_1s_steps(1)_infinite]">_</span>
            </div>
          )}

          {status === 'done' && (
            <div className="text-emerald-400 mt-2 border-t border-border/30 pt-2">
              ✅ Fila finalizada
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
