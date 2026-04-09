import type { Lead } from '@/lib/types'
import { SCORE_REASON_LABELS } from '@/lib/types'

export default function PainScoreCard({ lead }: { lead: Lead }) {
  const score = lead.pain_score ?? 0

  let barColor = 'bg-emerald-500/70'
  if (score > 6) barColor = 'bg-red-500/70'
  else if (score >= 4) barColor = 'bg-yellow-500/70'

  const reasons = (lead.score_reasons ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <h2 className="text-xs font-semibold text-text uppercase tracking-wide">Pain Score</h2>

      <div className="text-center">
        <span className="text-4xl font-bold text-text">{score}</span>
        <span className="text-lg text-muted">/10</span>
      </div>

      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${(score / 10) * 100}%` }} />
      </div>

      {reasons.length > 0 && (
        <ul className="space-y-1.5">
          {reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-sm">
              <span className="text-danger mt-0.5 shrink-0">•</span>
              <span className="text-text/80">{SCORE_REASON_LABELS[reason] ?? reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
