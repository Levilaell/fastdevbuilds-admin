'use client'

import { useState } from 'react'

interface VariantInput {
  name: string
  niches: string
  cities: string
  message_template: string
  target_volume: string
}

const EMPTY_VARIANT: VariantInput = {
  name: '',
  niches: '',
  cities: '',
  message_template: '',
  target_volume: '30',
}

export default function NewExperimentForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [hypothesis, setHypothesis] = useState('')
  const [variants, setVariants] = useState<VariantInput[]>([
    { ...EMPTY_VARIANT },
    { ...EMPTY_VARIANT },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function updateVariant(index: number, patch: Partial<VariantInput>) {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    )
  }

  function addVariant() {
    setVariants((prev) => [...prev, { ...EMPTY_VARIANT }])
  }

  function removeVariant(index: number) {
    if (variants.length <= 1) return
    setVariants((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    setError('')
    if (!name.trim()) return setError('Nome é obrigatório')
    if (variants.length === 0) return setError('Pelo menos 1 variant')

    const payload = {
      name: name.trim(),
      hypothesis: hypothesis.trim() || undefined,
      variants: variants.map((v) => ({
        name: v.name.trim(),
        niches: v.niches.split(',').map((s) => s.trim()).filter(Boolean),
        cities: v.cities.split(',').map((s) => s.trim()).filter(Boolean),
        message_template: v.message_template.trim(),
        target_volume: parseInt(v.target_volume, 10) || 30,
      })),
    }

    for (const v of payload.variants) {
      if (!v.name) return setError('Cada variant precisa de nome')
      if (!v.message_template) return setError(`Variant "${v.name}" sem copy`)
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Novo experimento</h2>
        <button
          onClick={onCancel}
          className="text-xs text-muted hover:text-text"
        >
          Cancelar
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted mb-1">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Doceira vs marceneiro v1"
            className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">
            Hipótese (opcional)
          </label>
          <textarea
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            rows={2}
            placeholder="Ex: doceira responde mais que marceneiro com mesma copy"
            className="w-full px-3 py-2 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent resize-y"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-text uppercase tracking-wide">
            Variants
          </h3>
          <button
            onClick={addVariant}
            className="text-xs text-accent hover:underline"
          >
            + Adicionar variant
          </button>
        </div>

        {variants.map((v, i) => (
          <div
            key={i}
            className="bg-sidebar border border-border rounded-lg p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-muted">
                variant {i + 1}
              </span>
              {variants.length > 1 && (
                <button
                  onClick={() => removeVariant(i)}
                  className="text-[11px] text-danger hover:underline"
                >
                  remover
                </button>
              )}
            </div>
            <input
              value={v.name}
              onChange={(e) => updateVariant(i, { name: e.target.value })}
              placeholder="Nome (ex: doceira-sjrp)"
              className="w-full h-8 px-2 text-xs rounded border border-border bg-background text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={v.niches}
                onChange={(e) => updateVariant(i, { niches: e.target.value })}
                placeholder="Nichos (vírgula)"
                className="h-8 px-2 text-xs rounded border border-border bg-background text-text focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <input
                value={v.cities}
                onChange={(e) => updateVariant(i, { cities: e.target.value })}
                placeholder="Cidades (vírgula)"
                className="h-8 px-2 text-xs rounded border border-border bg-background text-text focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <textarea
              value={v.message_template}
              onChange={(e) =>
                updateVariant(i, { message_template: e.target.value })
              }
              rows={3}
              placeholder="Mensagem inicial. Use {nome}, {cidade}, {vertical} pra interpolar."
              className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background text-text focus:outline-none focus:ring-1 focus:ring-accent resize-y font-mono leading-relaxed"
            />
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted">target volume:</label>
              <input
                type="number"
                min={1}
                value={v.target_volume}
                onChange={(e) =>
                  updateVariant(i, { target_volume: e.target.value })
                }
                className="w-20 h-7 px-2 text-xs rounded border border-border bg-background text-text focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
              />
              <span className="text-[10px] text-muted">leads</span>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full h-9 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting ? 'Criando…' : 'Criar experimento'}
      </button>
    </div>
  )
}
