'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { timeAgo } from '@/lib/time-ago'
import type { BotRun } from '@/lib/types'

// ─── Presets ───

const NICHE_PRESETS = [
  'clinicas odontologicas',
  'academias',
  'restaurantes',
  'imobiliarias',
  'saloes de beleza',
  'advogados',
]

const CITY_PRESETS = [
  'São Paulo, SP',
  'Campinas, SP',
  'Guarulhos, SP',
  'São Bernardo do Campo, SP',
  'Osasco, SP',
  'Miami, FL',
  'Austin, TX',
]

// ─── Terminal line ───

interface TermLine {
  text: string
  type: 'info' | 'success' | 'warning' | 'error'
}

function classifyLine(text: string): TermLine['type'] {
  if (text.includes('❌') || text.includes('error') || text.includes('Error') || text.includes('failed'))
    return 'error'
  if (text.includes('✅') || text.includes('completed') || text.includes('success') || text.includes('done'))
    return 'success'
  if (text.includes('⚠') || text.includes('warning') || text.includes('skip'))
    return 'warning'
  return 'info'
}

const LINE_COLORS: Record<TermLine['type'], string> = {
  info: 'text-[#e0e0e0]',
  success: 'text-emerald-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
}

// ─── Run history row ───

function RunHistoryRow({ run }: { run: BotRun }) {
  const statusBadge = {
    running: 'text-blue-400 bg-blue-500/10',
    completed: 'text-emerald-400 bg-emerald-500/10',
    failed: 'text-red-400 bg-red-500/10',
  }[run.status]

  return (
    <div className="flex items-center gap-4 py-2 text-xs">
      <span className={`px-1.5 py-0.5 rounded ${statusBadge}`}>{run.status}</span>
      <span className="text-text truncate flex-1">
        {run.niche ?? '—'} / {run.city ?? '—'}
      </span>
      <span className="text-muted tabular-nums">
        {run.collected ?? 0}/{run.qualified ?? 0}/{run.sent ?? 0}
      </span>
      <span className="text-muted tabular-nums shrink-0">
        {run.duration_seconds ? `${run.duration_seconds}s` : '—'}
      </span>
      <span className="text-muted shrink-0">{timeAgo(run.started_at)}</span>
    </div>
  )
}

// ─── Main component ───

export default function BotClient() {
  // Form state
  const [niche, setNiche] = useState('')
  const [city, setCity] = useState('')
  const [limit, setLimit] = useState(20)
  const [minScore, setMinScore] = useState(4)
  const [lang, setLang] = useState<'pt' | 'en'>('pt')
  const [exportTarget, setExportTarget] = useState<'csv' | 'supabase' | 'both'>('both')
  const [dryRun, setDryRun] = useState(false)
  const [send, setSend] = useState(false)

  // Terminal state
  const [lines, setLines] = useState<TermLine[]>([])
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const terminalRef = useRef<HTMLDivElement>(null)

  // History
  const [runs, setRuns] = useState<BotRun[]>([])

  // Fetch run history
  const fetchRuns = useCallback(async () => {
    const res = await fetch('/api/bot/runs')
    if (res.ok) {
      const data = await res.json()
      setRuns(data)
    }
  }, [])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [lines.length])

  async function handleRun() {
    if (running) return
    if (!niche.trim() || !city.trim()) return

    setRunning(true)
    setStatus('running')
    setLines([{ text: `$ prospect-bot --niche "${niche}" --city "${city}" --limit ${limit}`, type: 'info' }])

    try {
      const res = await fetch('/api/bot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: niche.trim(),
          city: city.trim(),
          limit,
          min_score: minScore,
          lang,
          export_target: exportTarget,
          dry_run: dryRun,
          send: send && !dryRun,
        }),
      })

      if (!res.body) {
        setLines((prev) => [...prev, { text: '❌ Sem resposta do servidor', type: 'error' }])
        setStatus('error')
        setRunning(false)
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
            setStatus('done')
            setRunning(false)
            fetchRuns()
            return
          }

          try {
            const parsed = JSON.parse(payload)
            const lineText: string = parsed.line ?? payload
            const lineType: TermLine['type'] = parsed.type ?? classifyLine(lineText)
            setLines((prev) => [...prev, { text: lineText, type: lineType }])
          } catch {
            setLines((prev) => [...prev, { text: payload, type: classifyLine(payload) }])
          }
        }
      }

      // Stream ended without [DONE]
      if (status === 'running') {
        setStatus('done')
        setRunning(false)
        fetchRuns()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setLines((prev) => [...prev, { text: `❌ ${msg}`, type: 'error' }])
      setStatus('error')
      setRunning(false)
    }
  }

  function handleClear() {
    setLines([])
    setStatus('idle')
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* ─── Form ─── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-5">
        <h2 className="text-xs font-semibold text-text uppercase tracking-wide">Configuração do Bot</h2>

        {/* Niche */}
        <div>
          <label className="block text-xs text-muted mb-1.5">Nicho</label>
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="clinicas odontologicas"
            className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {NICHE_PRESETS.map((n) => (
              <button
                key={n}
                onClick={() => setNiche(n)}
                className={`px-2 py-1 text-[11px] rounded border ${
                  niche === n
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-muted hover:text-text hover:bg-card-hover'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* City */}
        <div>
          <label className="block text-xs text-muted mb-1.5">Cidade</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="São Paulo, SP"
            className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {CITY_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setCity(c)}
                className={`px-2 py-1 text-[11px] rounded border ${
                  city === c
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-muted hover:text-text hover:bg-card-hover'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">
              Limite: <span className="text-text font-mono">{limit}</span>
            </label>
            <input
              type="range"
              min={10}
              max={60}
              step={5}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">
              Score mín.: <span className="text-text font-mono">{minScore}</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
        </div>

        {/* Toggles row */}
        <div className="flex flex-wrap items-center gap-5">
          {/* Lang */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Idioma:</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setLang('pt')}
                className={`px-3 py-1.5 text-xs font-medium ${lang === 'pt' ? 'bg-accent/15 text-accent' : 'text-muted bg-sidebar'}`}
              >
                PT
              </button>
              <button
                onClick={() => setLang('en')}
                className={`px-3 py-1.5 text-xs font-medium border-l border-border ${lang === 'en' ? 'bg-accent/15 text-accent' : 'text-muted bg-sidebar'}`}
              >
                EN
              </button>
            </div>
          </div>

          {/* Export */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Export:</span>
            {(['csv', 'supabase', 'both'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setExportTarget(opt)}
                className={`px-2.5 py-1.5 text-xs rounded border ${
                  exportTarget === opt
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-muted hover:text-text'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          {/* Dry run */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => { setDryRun(e.target.checked); if (e.target.checked) setSend(false) }}
              className="accent-accent"
            />
            <span className="text-xs text-muted">Dry run</span>
          </label>

          {/* Send */}
          {!dryRun && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={send}
                onChange={(e) => setSend(e.target.checked)}
                className="accent-accent"
              />
              <span className="text-xs text-muted">Enviar mensagens</span>
            </label>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleRun}
            disabled={running || !niche.trim() || !city.trim()}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50 flex items-center gap-2"
          >
            {running && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {running ? 'Executando…' : 'Rodar Bot'}
          </button>
          <button
            onClick={handleClear}
            disabled={running}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted hover:text-text hover:bg-card-hover disabled:opacity-50"
          >
            Limpar terminal
          </button>
        </div>
      </div>

      {/* ─── Terminal ─── */}
      <div className="bg-[#000] border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-[#0a0a0a]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-xs text-muted font-mono ml-2">prospect-bot</span>
          {running && (
            <span className="text-xs text-emerald-400 ml-auto font-mono">running</span>
          )}
        </div>

        <div
          ref={terminalRef}
          className="p-4 font-mono text-sm leading-relaxed overflow-y-auto"
          style={{ height: 'calc(100vh - 600px)', minHeight: '240px' }}
        >
          {lines.length === 0 && status === 'idle' && (
            <div className="text-muted/50 flex items-center gap-1">
              <span>Aguardando execução...</span>
              <span className="animate-pulse">▊</span>
            </div>
          )}

          {lines.map((line, i) => (
            <div key={i} className={LINE_COLORS[line.type]}>
              {line.text}
            </div>
          ))}

          {running && (
            <div className="text-muted/50 mt-1 flex items-center gap-1">
              <span className="animate-pulse">▊</span>
            </div>
          )}

          {status === 'done' && (
            <div className="text-emerald-400 mt-2 border-t border-border/50 pt-2">
              ✅ Execução finalizada
            </div>
          )}
        </div>
      </div>

      {/* ─── Run history ─── */}
      {runs.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-xs font-semibold text-text uppercase tracking-wide mb-3">
            Últimas execuções
          </h2>
          <div className="text-[10px] text-muted flex items-center gap-4 mb-2 px-0">
            <span className="w-16">Status</span>
            <span className="flex-1">Nicho / Cidade</span>
            <span className="tabular-nums">Col/Qual/Env</span>
            <span className="tabular-nums">Duração</span>
            <span>Quando</span>
          </div>
          <div className="divide-y divide-border">
            {runs.map((run) => (
              <RunHistoryRow key={run.id} run={run} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
