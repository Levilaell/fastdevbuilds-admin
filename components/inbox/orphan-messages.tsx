'use client'

import { useEffect, useMemo, useState } from 'react'
import { timeAgo } from '@/lib/time-ago'
import { STATUS_LABELS, STATUS_COLORS, type LeadStatus } from '@/lib/types'

interface OrphanItem {
  id: string
  received_at: string
  message_sent_at: string
  remote_jid: string
  push_name: string | null
  message_text: string | null
  evolution_instance: string | null
  reason: string
}

interface LeadOption {
  place_id: string
  business_name: string | null
  city: string | null
  status: LeadStatus
  outreach_channel: string | null
  evolution_instance: string | null
}

interface Suggestion {
  quarantine_id: string
  place_id: string
  business_name: string | null
  reason: 'pushname' | 'timing'
  note: string
  orphan: {
    push_name: string | null
    message_text: string | null
    message_sent_at: string
    remote_jid: string
    evolution_instance: string | null
  }
}

interface Props {
  onResolved: () => void
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export default function OrphanMessages({ onResolved }: Props) {
  const [items, setItems] = useState<OrphanItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [selected, setSelected] = useState<OrphanItem | null>(null)
  const [showSuggest, setShowSuggest] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch('/api/quarantine')
      if (cancelled) return
      if (res.ok) {
        const data = (await res.json()) as OrphanItem[]
        setItems(data)
      }
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const todayCount = useMemo(
    () => items.filter((i) => isToday(i.message_sent_at)).length,
    [items],
  )

  async function dismiss(orphanId: string) {
    const res = await fetch('/api/quarantine/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quarantine_id: orphanId }),
    })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== orphanId))
      onResolved()
    }
  }

  const count = items.length

  if (!loaded || count === 0) return null

  return (
    <>
      <div className="border-b border-border bg-warning/5">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-warning/10"
        >
          <div className="flex items-center gap-2 min-w-0">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-warning shrink-0"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-xs font-semibold text-text shrink-0">
              Mensagens órfãs
            </span>
            <span className="text-[10px] font-semibold text-warning px-1.5 py-0.5 rounded bg-warning/15 border border-warning/20 tabular-nums shrink-0">
              {count}
            </span>
            {todayCount > 0 && (
              <span className="text-[10px] text-warning/90 shrink-0">
                · {todayCount} de hoje
              </span>
            )}
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-muted transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {expanded && (
          <>
            {todayCount > 0 && (
              <div className="px-4 py-2 border-t border-warning/20 bg-warning/10">
                <p className="text-[11px] text-warning/90 leading-snug">
                  <strong>{todayCount}</strong>{' '}
                  {todayCount === 1
                    ? 'mensagem de hoje'
                    : 'mensagens de hoje'}{' '}
                  ainda não atribuída. Confira no seu celular pra não perder o
                  lead enquanto faz a triagem.
                </p>
              </div>
            )}

            <div className="px-4 py-2 border-t border-warning/20 flex items-center gap-2">
              <button
                onClick={() => setShowSuggest(true)}
                className="text-[11px] font-medium text-accent hover:text-accent/80"
              >
                ⚡ Sugerir atribuições
              </button>
              <span className="text-[10px] text-muted">
                · matching automático de alta confiança
              </span>
            </div>

            <ul className="divide-y divide-border/50 max-h-80 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="flex items-stretch">
                  <button
                    onClick={() => setSelected(item)}
                    className="flex-1 text-left px-4 py-2.5 hover:bg-card-hover min-w-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-text truncate">
                        {item.push_name || '(sem nome)'}
                      </span>
                      <span className="text-[10px] text-muted shrink-0 tabular-nums">
                        {timeAgo(item.message_sent_at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted truncate mt-0.5">
                      {item.message_text || '(sem texto)'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {item.evolution_instance && (
                        <span className="text-[9px] text-zinc-500 px-1 py-0.5 rounded border border-zinc-700/50 bg-zinc-800/50 tabular-nums">
                          {item.evolution_instance}
                        </span>
                      )}
                      <span className="text-[9px] text-muted font-mono truncate">
                        {item.remote_jid}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      dismiss(item.id)
                    }}
                    title="Dispensar (não é um lead)"
                    aria-label="Dispensar"
                    className="px-3 text-muted hover:text-danger hover:bg-danger/5 border-l border-border/50"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {selected && (
        <AttributeModal
          orphan={selected}
          onClose={() => setSelected(null)}
          onAttributed={() => {
            setItems((prev) => prev.filter((i) => i.id !== selected.id))
            setSelected(null)
            onResolved()
          }}
        />
      )}

      {showSuggest && (
        <SuggestModal
          onClose={() => setShowSuggest(false)}
          onApplied={(appliedIds) => {
            setItems((prev) => prev.filter((i) => !appliedIds.has(i.id)))
            onResolved()
          }}
        />
      )}
    </>
  )
}

function SuggestModal({
  onClose,
  onApplied,
}: {
  onClose: () => void
  onApplied: (appliedIds: Set<string>) => void
}) {
  const [loading, setLoading] = useState(true)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !applying) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applying, onClose])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch('/api/quarantine/suggest')
      if (cancelled) return
      if (res.ok) {
        const data = (await res.json()) as Suggestion[]
        setSuggestions(data)
        setChecked(new Set(data.map((s) => s.quarantine_id)))
      } else {
        setError('Falha ao carregar sugestões')
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applyAll() {
    const toApply = suggestions.filter((s) => checked.has(s.quarantine_id))
    if (toApply.length === 0) return

    setApplying(true)
    setError('')
    setProgress({ done: 0, total: toApply.length })

    const applied = new Set<string>()
    for (let i = 0; i < toApply.length; i++) {
      const s = toApply[i]
      try {
        const res = await fetch('/api/quarantine/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quarantine_id: s.quarantine_id,
            place_id: s.place_id,
          }),
        })
        if (res.ok) applied.add(s.quarantine_id)
      } catch {
        // Skip this one; continue with the rest so one transient error
        // doesn't abort the whole batch.
      }
      setProgress({ done: i + 1, total: toApply.length })
    }

    onApplied(applied)
    setApplying(false)
    if (applied.size === toApply.length) {
      onClose()
    } else {
      setError(
        `${applied.size} atribuídas. ${toApply.length - applied.size} falharam — tente de novo.`,
      )
      setSuggestions((prev) =>
        prev.filter((s) => !applied.has(s.quarantine_id)),
      )
    }
  }

  const allChecked = suggestions.length > 0 && checked.size === suggestions.length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => {
        if (!applying) onClose()
      }}
    >
      <div
        className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-lg flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text">
            Sugestões de atribuição automática
          </h2>
          <p className="text-[11px] text-muted mt-1">
            Só aparecem aqui os matches de alta confiança (pushname ≈ negócio
            ou único outbound na janela). Desmarque qualquer um que você
            desconfiar antes de aplicar.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-5 py-10 text-center text-xs text-muted">
              Analisando {` `}
              <span className="animate-pulse">…</span>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-xs text-muted">
                Nenhuma sugestão de alta confiança encontrada.
              </p>
              <p className="text-[11px] text-muted mt-2">
                Todas as órfãs precisam de triagem manual — atribui pelo
                modal clicando em cada uma.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {suggestions.map((s) => {
                const isChecked = checked.has(s.quarantine_id)
                return (
                  <li key={s.quarantine_id}>
                    <label className="flex items-start gap-3 px-5 py-3 hover:bg-card-hover cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(s.quarantine_id)}
                        disabled={applying}
                        className="mt-1 accent-accent shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-text truncate">
                            {s.orphan.push_name || '(sem nome)'}
                          </span>
                          <span className="text-[10px] text-muted">→</span>
                          <span className="text-xs font-medium text-accent truncate">
                            {s.business_name || '(sem nome)'}
                          </span>
                          <span
                            className={`text-[9px] px-1 py-0.5 rounded border ${
                              s.reason === 'pushname'
                                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                : 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                            }`}
                          >
                            {s.reason === 'pushname' ? 'pushname' : 'timing'}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted mt-0.5 truncate">
                          {s.note}
                        </p>
                        <p className="text-[11px] text-muted/80 mt-1 truncate italic">
                          &ldquo;{s.orphan.message_text}&rdquo;
                        </p>
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {error && (
          <div className="px-5 py-2 border-t border-border">
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        {progress && applying && (
          <div className="px-5 py-2 border-t border-border">
            <p className="text-xs text-muted tabular-nums">
              Aplicando {progress.done}/{progress.total}…
            </p>
          </div>
        )}

        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
          {suggestions.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setChecked(
                  allChecked
                    ? new Set()
                    : new Set(suggestions.map((s) => s.quarantine_id)),
                )
              }
              disabled={applying}
              className="text-[11px] text-muted hover:text-text disabled:opacity-50"
            >
              {allChecked ? 'Desmarcar todas' : 'Marcar todas'}
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={applying}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-text hover:bg-sidebar disabled:opacity-50"
            >
              {suggestions.length === 0 ? 'Fechar' : 'Cancelar'}
            </button>
            {suggestions.length > 0 && (
              <button
                type="button"
                onClick={applyAll}
                disabled={applying || checked.size === 0}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent hover:bg-accent/80 text-white disabled:opacity-50"
              >
                {applying
                  ? 'Aplicando…'
                  : `Aplicar ${checked.size} atribuição${checked.size === 1 ? '' : 'ões'}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AttributeModal({
  orphan,
  onClose,
  onAttributed,
}: {
  orphan: OrphanItem
  onClose: () => void
  onAttributed: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LeadOption[]>([])
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && submitting === null) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submitting, onClose])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/leads?search=${encodeURIComponent(q)}`)
        if (res.ok) {
          const data = (await res.json()) as LeadOption[]
          setResults(data.slice(0, 20))
        }
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const sortedResults = useMemo(() => {
    if (!orphan.evolution_instance) return results
    const mine: LeadOption[] = []
    const others: LeadOption[] = []
    for (const r of results) {
      if (r.evolution_instance === orphan.evolution_instance) mine.push(r)
      else others.push(r)
    }
    return [...mine, ...others]
  }, [results, orphan.evolution_instance])

  async function attribute(placeId: string) {
    setSubmitting(placeId)
    setError('')
    try {
      const res = await fetch('/api/quarantine/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quarantine_id: orphan.id,
          place_id: placeId,
        }),
      })
      if (res.ok) {
        onAttributed()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Erro ao atribuir mensagem')
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => {
        if (submitting === null) onClose()
      }}
    >
      <div
        className="w-full max-w-lg bg-card border border-border rounded-xl shadow-lg flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text">
            Atribuir mensagem órfã a um lead
          </h2>
          <p className="text-[11px] text-muted mt-1">
            O @lid será salvo no lead e próximas mensagens desse contato caem
            direto na conversa certa.
          </p>
        </div>

        <div className="px-5 py-3 border-b border-border bg-sidebar/40 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-text truncate">
              {orphan.push_name || '(sem pushName)'}
            </span>
            <span className="text-[10px] text-muted tabular-nums shrink-0">
              {timeAgo(orphan.message_sent_at)}
            </span>
          </div>
          <p className="text-xs text-muted whitespace-pre-wrap">
            {orphan.message_text || '(sem texto)'}
          </p>
          <div className="flex items-center gap-1.5 pt-1">
            {orphan.evolution_instance && (
              <span className="text-[9px] text-zinc-400 px-1 py-0.5 rounded border border-zinc-700/50 bg-zinc-800/50">
                {orphan.evolution_instance}
              </span>
            )}
            <span className="text-[9px] text-muted font-mono truncate">
              {orphan.remote_jid}
            </span>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar lead por nome do negócio…"
            className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {searching ? (
            <div className="px-5 py-6 text-center text-xs text-muted">
              Buscando…
            </div>
          ) : !query.trim() ? (
            <div className="px-5 py-6 text-center text-xs text-muted">
              Digite pra buscar o lead certo
            </div>
          ) : sortedResults.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-muted">
              Nenhum lead encontrado
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {sortedResults.map((r) => {
                const sameInstance =
                  !!orphan.evolution_instance &&
                  r.evolution_instance === orphan.evolution_instance
                const isSubmitting = submitting === r.place_id
                return (
                  <li key={r.place_id}>
                    <button
                      onClick={() => attribute(r.place_id)}
                      disabled={submitting !== null}
                      className="w-full text-left px-5 py-2.5 hover:bg-card-hover disabled:opacity-40 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-text truncate">
                            {r.business_name || '(sem nome)'}
                          </span>
                          {sameInstance && (
                            <span className="text-[9px] text-accent px-1 py-0.5 rounded bg-accent/10 border border-accent/20 shrink-0">
                              mesma instância
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {r.city && (
                            <span className="text-[10px] text-muted">
                              {r.city}
                            </span>
                          )}
                          <span
                            className={`text-[9px] px-1 py-0.5 rounded ${STATUS_COLORS[r.status]}`}
                          >
                            {STATUS_LABELS[r.status]}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted shrink-0">
                        {isSubmitting ? 'Atribuindo…' : 'Atribuir →'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {error && (
          <div className="px-5 py-2 border-t border-border">
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        <div className="px-5 py-3 border-t border-border flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting !== null}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-text hover:bg-sidebar disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
