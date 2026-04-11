'use client'

import { useState } from 'react'
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type Project,
  type ProjectStatus,
} from '@/lib/types'

const fmtCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

interface Props {
  project: Project
  placeId: string
}

const FLOW: ProjectStatus[] = [
  'scoped',
  'approved',
  'in_progress',
  'delivered',
  'client_approved',
  'paid',
]

export default function ProjectStatusSection({ project: initial, placeId }: Props) {
  const [project, setProject] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [pixKey, setPixKey] = useState('')
  const [promptVisible, setPromptVisible] = useState(false)
  const [generatingPrompt, setGeneratingPrompt] = useState(false)

  const status = project.status as ProjectStatus
  const currentIdx = FLOW.indexOf(status)

  async function advanceStatus(newStatus: ProjectStatus) {
    const label = PROJECT_STATUS_LABELS[newStatus]
    if (!confirm(`Avançar projeto para "${label}"?`)) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(placeId)}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        },
      )
      if (res.ok) {
        const updated = await res.json()
        setProject(updated)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Erro ao atualizar status')
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendPreview() {
    if (!previewUrl.trim()) return
    setLoading(true)
    try {
      // Send preview URL via conversation
      await fetch('/api/conversations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          place_id: placeId,
          message: `Olá! Aqui está o preview do seu novo site: ${previewUrl}`,
          channel: 'whatsapp',
        }),
      })
      await advanceStatus('delivered')
    } finally {
      setLoading(false)
    }
  }

  async function handlePixSend() {
    if (!pixKey.trim()) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(placeId)}/pix`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pix_key: pixKey }),
        },
      )
      if (res.ok) {
        await advanceStatus('paid')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGeneratePrompt() {
    setGeneratingPrompt(true)
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(placeId)}/generate-prompt`,
        { method: 'POST' },
      )
      if (res.ok) {
        const data = await res.json()
        setProject(prev => ({ ...prev, claude_code_prompt: data.prompt }))
      }
    } finally {
      setGeneratingPrompt(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <h2 className="text-xs font-semibold text-text uppercase tracking-wide">
        Status do Projeto
      </h2>

      {/* Status flow */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {FLOW.map((s, i) => {
          const isActive = s === status
          const isPast = i < currentIdx
          return (
            <div key={s} className="flex items-center gap-1 shrink-0">
              {i > 0 && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={isPast ? 'text-success' : 'text-border'}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  isActive
                    ? 'bg-accent/15 text-accent font-semibold'
                    : isPast
                      ? 'text-success bg-success/10'
                      : 'text-muted bg-border/50'
                }`}
              >
                {PROJECT_STATUS_LABELS[s]}
              </span>
            </div>
          )
        })}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Contextual actions */}
      {status === 'scoped' && (
        <button
          onClick={() => advanceStatus('approved')}
          disabled={loading}
          className="w-full py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
        >
          {loading ? 'Atualizando…' : 'Cliente autorizou →'}
        </button>
      )}

      {status === 'approved' && (
        <button
          onClick={() => advanceStatus('in_progress')}
          disabled={loading}
          className="w-full py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
        >
          {loading ? 'Atualizando…' : 'Marcar em progresso →'}
        </button>
      )}

      {status === 'in_progress' && (
        <div className="space-y-3">
          {/* Claude Code prompt */}
          {project.claude_code_prompt ? (
            <div className="bg-sidebar border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs text-accent font-medium">
                  Prompt para Claude Code
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(project.claude_code_prompt!)}
                  className="text-[10px] text-muted hover:text-text px-1.5 py-0.5 rounded border border-border"
                >
                  Copiar
                </button>
              </div>
              {promptVisible ? (
                <pre className="p-3 text-xs text-text/80 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
                  {project.claude_code_prompt}
                </pre>
              ) : (
                <div className="p-3">
                  <p className="text-xs text-text/60 line-clamp-3">
                    {project.claude_code_prompt.slice(0, 200)}…
                  </p>
                  <button
                    onClick={() => setPromptVisible(true)}
                    className="text-[10px] text-accent hover:underline mt-1"
                  >
                    Ver prompt completo
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleGeneratePrompt}
              disabled={generatingPrompt}
              className="w-full py-2 text-xs font-medium rounded-lg border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              {generatingPrompt ? 'Gerando prompt…' : 'Gerar prompt Claude Code'}
            </button>
          )}

          {/* Preview URL */}
          <input
            type="url"
            value={previewUrl}
            onChange={e => setPreviewUrl(e.target.value)}
            placeholder="https://preview.vercel.app/..."
            className="w-full h-8 px-3 text-xs rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={handleSendPreview}
            disabled={loading || !previewUrl.trim()}
            className="w-full py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
          >
            {loading ? 'Enviando…' : 'Enviar link de preview →'}
          </button>
        </div>
      )}

      {status === 'delivered' && (
        <button
          onClick={() => advanceStatus('client_approved')}
          disabled={loading}
          className="w-full py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
        >
          {loading ? 'Atualizando…' : 'Cliente aprovou →'}
        </button>
      )}

      {status === 'client_approved' && (
        <div className="space-y-2">
          <input
            type="text"
            value={pixKey}
            onChange={e => setPixKey(e.target.value)}
            placeholder="Chave PIX (CPF, email, telefone)"
            className="w-full h-8 px-3 text-xs rounded-lg bg-sidebar border border-border text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={handlePixSend}
            disabled={loading || !pixKey.trim()}
            className="w-full py-2 text-xs font-medium rounded-lg bg-success hover:bg-success/80 text-white disabled:opacity-50"
          >
            {loading ? 'Enviando…' : 'Gerar cobrança PIX'}
          </button>
        </div>
      )}

      {status === 'paid' && (
        <div className="flex items-center gap-2 text-xs text-success">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Projeto pago — {fmtCurrency.format(project.price ?? 0)}
        </div>
      )}

      {status === 'cancelled' && (
        <p className="text-xs text-danger">Projeto cancelado</p>
      )}
    </div>
  )
}
