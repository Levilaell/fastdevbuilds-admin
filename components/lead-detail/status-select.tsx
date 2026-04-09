'use client'

import { useState } from 'react'
import { LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from '@/lib/types'

interface StatusSelectProps {
  placeId: string
  initialStatus: LeadStatus
}

export default function StatusSelect({ placeId, initialStatus }: StatusSelectProps) {
  const [status, setStatus] = useState<LeadStatus>(initialStatus)
  const [saving, setSaving] = useState(false)

  async function handleChange(newStatus: LeadStatus) {
    setSaving(true)
    const prev = status
    setStatus(newStatus)

    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(placeId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) setStatus(prev)
    } catch {
      setStatus(prev)
    } finally {
      setSaving(false)
    }
  }

  const showProjectBtn = status === 'scoped' || status === 'closed'

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-muted mb-1.5">Status do pipeline</label>
        <select
          value={status}
          onChange={(e) => handleChange(e.target.value as LeadStatus)}
          disabled={saving}
          className="w-full h-9 px-3 text-sm rounded-lg bg-sidebar border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {showProjectBtn && (
        <button
          disabled
          className="w-full h-9 text-sm rounded-lg border border-border text-muted bg-card-hover cursor-not-allowed"
        >
          Abrir projeto (em breve)
        </button>
      )}
    </div>
  )
}
