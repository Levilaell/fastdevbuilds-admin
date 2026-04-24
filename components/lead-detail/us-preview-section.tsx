'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Project } from '@/lib/types'

interface USPreviewSectionProps {
  placeId: string
  project: Project
}

interface InstanceOption {
  name: string
  country: string
  sent_today: number
}

/**
 * US-WhatsApp preview-first workflow UI. Three states:
 *
 *   1. Prompt ready, no URL: show the Claude Code prompt to copy, input for
 *      the Vercel preview URL, button to dispatch.
 *   2. URL pasted, dispatched: show "sent at X" + the URL as a link.
 *   3. No prompt yet: hidden (bot is still generating, or something failed).
 */
export default function USPreviewSection({ placeId, project }: USPreviewSectionProps) {
  const router = useRouter()
  const [urlInput, setUrlInput] = useState(project.preview_url ?? '')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
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

  async function handleCopy() {
    if (!project.claude_code_prompt) return
    try {
      await navigator.clipboard.writeText(project.claude_code_prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Falha ao copiar — use select manual')
    }
  }

  async function handleSend() {
    setError(null)
    const trimmed = urlInput.trim()
    if (!trimmed) {
      setError('Cola a URL do preview antes de enviar')
      return
    }
    try {
      new URL(trimmed)
    } catch {
      setError('URL inválida')
      return
    }
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
                onClick={handleCopy}
                className="text-[10px] text-accent hover:underline"
              >
                {copied ? 'Copiado ✓' : 'Copiar prompt'}
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
              disabled={sending}
              className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
          </div>

          {instances.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-[10px] text-muted uppercase tracking-wider">
                3. Chip (opcional — default auto least-used)
              </label>
              <select
                value={selectedInstance}
                onChange={(e) => setSelectedInstance(e.target.value)}
                disabled={sending}
                className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              >
                <option value="">Auto (least-used nas últimas 24h)</option>
                {instances.map((inst) => (
                  <option key={inst.name} value={inst.name}>
                    {inst.name} ({inst.country}) — {inst.sent_today} hoje
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            onClick={handleSend}
            disabled={sending || !urlInput.trim()}
            className="w-full py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-40"
          >
            {sending ? 'Enviando…' : '4. Enviar preview via WhatsApp'}
          </button>

          <p className="text-[10px] text-muted leading-relaxed">
            O admin compõe a mensagem com a URL, envia via Evolution, e marca o
            lead como "Preview enviado" no kanban.
          </p>
        </>
      )}
    </div>
  )
}
