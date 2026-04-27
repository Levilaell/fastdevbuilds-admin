'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Project } from '@/lib/types'
import { timeAgo } from '@/lib/time-ago'

interface USPreviewSectionProps {
  placeId: string
  project: Project
  previewViews?: {
    firstAt: string | null
    count: number
  }
}

interface InstanceOption {
  name: string
  country: string
  sent_today: number
}

/**
 * US-WhatsApp preview-first workflow UI. Two send modes:
 *
 *   - Manual (Levi sends from phone): "Copiar mensagem" → generates via
 *     Claude, copies to clipboard, shows textarea. Then "Marcar enviado"
 *     records the outbound row + sets preview_sent_at without calling
 *     Evolution.
 *   - Auto: "Enviar via WhatsApp" hits dispatch-preview which generates and
 *     dispatches via Evolution in one shot.
 *
 * Hidden until claude_code_prompt is populated; switches to a sent-state
 * summary once preview_sent_at is set.
 */
export default function USPreviewSection({ placeId, project, previewViews }: USPreviewSectionProps) {
  const router = useRouter()
  const [urlInput, setUrlInput] = useState(project.preview_url ?? '')
  const [sending, setSending] = useState(false)
  const [composing, setComposing] = useState(false)
  const [marking, setMarking] = useState(false)
  const [composedMessage, setComposedMessage] = useState<string>('')
  const [promptCopied, setPromptCopied] = useState(false)
  const [msgCopied, setMsgCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [instances, setInstances] = useState<InstanceOption[]>([])
  const [selectedInstance, setSelectedInstance] = useState<string>('')

  useEffect(() => {
    async function loadInstances() {
      try {
        const res = await fetch('/api/bot/instance-usage')
        if (!res.ok) return
        const data = await res.json()
        const items: InstanceOption[] = data.instances ?? []
        setInstances(items)
      } catch {
        /* ignore — dropdown just won't show manual options */
      }
    }
    loadInstances()
  }, [])

  if (!project.claude_code_prompt) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 text-xs text-muted">
        Aguardando geração do prompt Claude Code…
      </div>
    )
  }

  const alreadySent = Boolean(project.preview_sent_at)

  async function handleCopyPrompt() {
    if (!project.claude_code_prompt) return
    try {
      await navigator.clipboard.writeText(project.claude_code_prompt)
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    } catch {
      setError('Falha ao copiar — use select manual')
    }
  }

  function validateUrl(): string | null {
    const trimmed = urlInput.trim()
    if (!trimmed) {
      setError('Cola a URL do preview antes de continuar')
      return null
    }
    try {
      new URL(trimmed)
    } catch {
      setError('URL inválida')
      return null
    }
    return trimmed
  }

  async function handleCompose() {
    setError(null)
    const trimmed = validateUrl()
    if (!trimmed) return

    setComposing(true)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(placeId)}/compose-preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preview_url: trimmed }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
        return
      }
      const msg: string = data.message ?? ''
      setComposedMessage(msg)
      try {
        await navigator.clipboard.writeText(msg)
        setMsgCopied(true)
        setTimeout(() => setMsgCopied(false), 2000)
      } catch {
        /* clipboard failed — textarea below still lets manual select */
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setComposing(false)
    }
  }

  async function handleRecopyMessage() {
    if (!composedMessage) return
    try {
      await navigator.clipboard.writeText(composedMessage)
      setMsgCopied(true)
      setTimeout(() => setMsgCopied(false), 2000)
    } catch {
      setError('Falha ao copiar — selecione manualmente')
    }
  }

  async function handleMarkSent() {
    setError(null)
    if (!composedMessage.trim()) {
      setError('Gera a mensagem primeiro')
      return
    }
    setMarking(true)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(placeId)}/mark-preview-sent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: composedMessage }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      router.refresh()
    } catch {
      setError('Erro de conexão')
    } finally {
      setMarking(false)
    }
  }

  async function handleSendViaEvolution() {
    setError(null)
    const trimmed = validateUrl()
    if (!trimmed) return

    setSending(true)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(placeId)}/dispatch-preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            preview_url: trimmed,
            ...(selectedInstance ? { evolution_instance: selectedInstance } : {}),
          }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      router.refresh()
    } catch {
      setError('Erro de conexão')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-text uppercase tracking-wide">
          Preview · US
        </h2>
        {alreadySent && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
            Enviado
          </span>
        )}
      </div>

      {alreadySent ? (
        <div className="space-y-2 text-xs">
          <p className="text-muted">
            Preview enviado em{' '}
            {new Date(project.preview_sent_at!).toLocaleString('pt-BR')}
          </p>
          {previewViews && previewViews.count > 0 ? (
            <p className="text-emerald-400">
              Visto {timeAgo(previewViews.firstAt)}
              {previewViews.count > 1 ? ` · ${previewViews.count}x` : ''}
            </p>
          ) : (
            <p className="text-muted/70">Ainda não abriu</p>
          )}
          {project.preview_url && (
            <a
              href={project.preview_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-accent hover:underline truncate"
            >
              {project.preview_url}
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-muted uppercase tracking-wider">
                1. Rodar Claude Code local
              </label>
              <button
                onClick={handleCopyPrompt}
                className="text-[10px] text-accent hover:underline"
              >
                {promptCopied ? 'Copiado ✓' : 'Copiar prompt'}
              </button>
            </div>
            <pre className="text-[10px] leading-relaxed bg-background border border-border rounded-lg p-2.5 overflow-x-auto max-h-32 text-text/80">
              {project.claude_code_prompt.slice(0, 400)}
              {project.claude_code_prompt.length > 400 ? '\n…' : ''}
            </pre>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] text-muted uppercase tracking-wider">
              2. Colar URL do preview Vercel
            </label>
            <input
              type="url"
              placeholder="https://preview-xxx.vercel.app"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              disabled={sending || composing || marking}
              className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          {/* Manual flow — primary path: copia mensagem pra mandar do celular */}
          <div className="space-y-2 pt-1 border-t border-border/40">
            <p className="text-[10px] text-muted uppercase tracking-wider">
              3. Envio manual (do celular)
            </p>
            <button
              onClick={handleCompose}
              disabled={composing || sending || marking || !urlInput.trim()}
              className="w-full py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-40"
            >
              {composing
                ? 'Gerando…'
                : msgCopied && composedMessage
                  ? 'Copiado ✓ — gerar de novo'
                  : composedMessage
                    ? 'Gerar mensagem de novo'
                    : 'Copiar mensagem'}
            </button>

            {composedMessage && (
              <div className="space-y-1.5">
                <textarea
                  readOnly
                  value={composedMessage}
                  rows={6}
                  className="w-full px-3 py-2 text-xs leading-relaxed rounded-lg bg-background border border-border text-text/90 focus:outline-none focus:ring-1 focus:ring-accent resize-y"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleRecopyMessage}
                    className="flex-1 py-1.5 text-[11px] rounded-lg border border-border hover:bg-sidebar text-text/80"
                  >
                    {msgCopied ? 'Copiado ✓' : 'Recopiar'}
                  </button>
                  <button
                    onClick={handleMarkSent}
                    disabled={marking}
                    className="flex-1 py-1.5 text-[11px] rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 disabled:opacity-40"
                  >
                    {marking ? 'Marcando…' : 'Marcar como enviado'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Auto flow — Evolution dispara direto */}
          <div className="space-y-2 pt-2 border-t border-border/40">
            <p className="text-[10px] text-muted uppercase tracking-wider">
              Ou: envio automático (Evolution)
            </p>

            {instances.length > 0 && (
              <select
                value={selectedInstance}
                onChange={(e) => setSelectedInstance(e.target.value)}
                disabled={sending || composing || marking}
                className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              >
                <option value="">Auto (least-used 24h)</option>
                {instances.map((inst) => (
                  <option key={inst.name} value={inst.name}>
                    {inst.name} ({inst.country}) — {inst.sent_today} hoje
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={handleSendViaEvolution}
              disabled={sending || composing || marking || !urlInput.trim()}
              className="w-full py-2 text-sm font-medium rounded-lg border border-accent/40 hover:bg-accent/10 text-accent disabled:opacity-40"
            >
              {sending ? 'Enviando…' : 'Enviar via WhatsApp'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
