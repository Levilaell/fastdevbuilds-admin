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

  return (
    <div>
      <label className="block text-xs text-muted mb-1.5">Status do pipeline</label>
      <div className="relative">
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
        {saving && (
          <div className="absolute right-8 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
