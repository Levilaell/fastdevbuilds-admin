import type { Lead } from '@/lib/types'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function OutreachCard({ lead }: { lead: Lead }) {
  const sentLabel = lead.outreach_sent ? 'Enviado' : 'Pendente'
  const sentColor = lead.outreach_sent
    ? 'text-success bg-success/10 border-success/20'
    : 'text-warning bg-warning/10 border-warning/20'

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h2 className="text-xs font-semibold text-text uppercase tracking-wide">Outreach</h2>

      {lead.message ? (
        <p className="text-sm text-text/80 whitespace-pre-wrap leading-relaxed">
          {lead.message}
        </p>
      ) : (
        <p className="text-sm text-muted italic">Nenhuma mensagem gerada</p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className={`px-2 py-0.5 rounded border ${sentColor}`}>
          {sentLabel}
        </span>
        {lead.outreach_channel && (
          <span className="text-muted px-2 py-0.5 rounded bg-border">
            {lead.outreach_channel}
          </span>
        )}
        {lead.outreach_sent_at && (
          <span className="text-muted">
            {formatDate(lead.outreach_sent_at)}
          </span>
        )}
      </div>
    </div>
  )
}
