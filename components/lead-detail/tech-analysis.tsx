import type { Lead } from '@/lib/types'

function BoolRow({ label, value }: { label: string; value: boolean | null }) {
  const icon = value ? '✅' : '❌'
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-text">{label}</span>
      <span className="text-sm">{icon}</span>
    </div>
  )
}

function ScoreCircle({ value, label }: { value: number | null; label: string }) {
  if (value == null) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full border-2 border-border flex items-center justify-center mx-auto">
          <span className="text-xs text-muted">—</span>
        </div>
        <span className="text-[10px] text-muted mt-1 block">{label}</span>
      </div>
    )
  }

  let borderColor = 'border-danger'
  if (value > 89) borderColor = 'border-success'
  else if (value >= 50) borderColor = 'border-warning'

  return (
    <div className="text-center">
      <div className={`w-12 h-12 rounded-full border-2 ${borderColor} flex items-center justify-center mx-auto`}>
        <span className="text-sm font-semibold text-text">{Math.round(value)}</span>
      </div>
      <span className="text-[10px] text-muted mt-1 block">{label}</span>
    </div>
  )
}

function MetricPill({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="text-center">
      <span className="text-xs text-muted block">{label}</span>
      <span className="text-sm font-mono text-text">
        {value != null ? `${Math.round(value)}${unit}` : '—'}
      </span>
    </div>
  )
}

export default function TechAnalysis({ lead }: { lead: Lead }) {
  // Inbound leads (niche='inbound') were never scraped — don't show misleading ❌
  const isInbound = lead.niche === 'inbound'
  if (isInbound && !lead.website) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-xs font-semibold text-text uppercase tracking-wide mb-2">Análise técnica</h2>
        <p className="text-xs text-muted">Lead inbound — sem site analisado</p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <h2 className="text-xs font-semibold text-text uppercase tracking-wide">Análise técnica</h2>

      <div className="divide-y divide-border">
        <BoolRow label="SSL" value={lead.has_ssl} />
        <BoolRow label="Mobile friendly" value={lead.is_mobile_friendly} />
        <BoolRow label="Meta Pixel" value={lead.has_pixel} />
        <BoolRow label="Google Analytics" value={lead.has_analytics} />
        <BoolRow label="WhatsApp no site" value={lead.has_whatsapp} />
        <BoolRow label="Formulário de contato" value={lead.has_form} />
        <BoolRow label="Sistema de booking" value={lead.has_booking} />
      </div>

      {lead.tech_stack && (
        <div className="flex items-center justify-between py-1">
          <span className="text-sm text-text">Tech stack</span>
          <span className="text-xs text-muted px-2 py-0.5 rounded bg-border">{lead.tech_stack}</span>
        </div>
      )}

      {/* PageSpeed scores */}
      <div>
        <h3 className="text-[11px] text-muted mb-3 uppercase tracking-wide">PageSpeed</h3>
        <div className="flex items-center justify-around mb-3">
          <ScoreCircle value={lead.mobile_score} label="Mobile" />
          <ScoreCircle value={lead.perf_score} label="Perf" />
        </div>
        <div className="flex items-center justify-around">
          <MetricPill label="FCP" value={lead.fcp} unit="ms" />
          <MetricPill label="LCP" value={lead.lcp} unit="ms" />
          <MetricPill label="CLS" value={lead.cls} unit="" />
        </div>
      </div>
    </div>
  )
}
