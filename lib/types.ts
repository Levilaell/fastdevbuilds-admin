export const LEAD_STATUSES = [
  'prospected',
  'sent',
  'replied',
  'negotiating',
  'scoped',
  'closed',
  'lost',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const STATUS_LABELS: Record<LeadStatus, string> = {
  prospected: 'Prospectado',
  sent: 'Enviado',
  replied: 'Respondeu',
  negotiating: 'Negociando',
  scoped: 'Escopo',
  closed: 'Fechado',
  lost: 'Perdido',
}

export const STATUS_COLORS: Record<LeadStatus, string> = {
  prospected: 'bg-slate-500/20 text-slate-400',
  sent: 'bg-blue-500/20 text-blue-400',
  replied: 'bg-yellow-500/20 text-yellow-400',
  negotiating: 'bg-orange-500/20 text-orange-400',
  scoped: 'bg-purple-500/20 text-purple-400',
  closed: 'bg-green-500/20 text-green-400',
  lost: 'bg-red-500/20 text-red-400',
}

export interface Lead {
  place_id: string
  business_name: string | null
  address: string | null
  city: string | null
  phone: string | null
  website: string | null
  rating: number | null
  review_count: number | null
  perf_score: number | null
  mobile_score: number | null
  fcp: number | null
  lcp: number | null
  cls: number | null
  has_ssl: boolean | null
  is_mobile_friendly: boolean | null
  has_pixel: boolean | null
  has_analytics: boolean | null
  has_whatsapp: boolean | null
  has_form: boolean | null
  has_booking: boolean | null
  tech_stack: string | null
  scrape_failed: boolean | null
  pain_score: number | null
  score_reasons: string | null
  message: string | null
  email: string | null
  email_source: string | null
  outreach_sent: boolean | null
  outreach_sent_at: string | null
  outreach_channel: string | null
  niche: string | null
  status: LeadStatus
  status_updated_at: string | null
}

export interface Conversation {
  id: string
  place_id: string
  direction: 'in' | 'out'
  channel: 'whatsapp' | 'email'
  message: string
  sent_at: string
  read_at: string | null
  suggested_by_ai: boolean | null
  approved_by: string | null
}

export const SCORE_REASON_LABELS: Record<string, string> = {
  slow_mobile_severe: 'Site muito lento no celular',
  slow_mobile_moderate: 'Site lento no celular',
  slow_mobile_mild: 'Site com velocidade moderada',
  no_pixel: 'Sem Meta Pixel',
  no_analytics: 'Sem Google Analytics',
  no_whatsapp: 'Sem WhatsApp no site',
  no_form: 'Sem formulário de contato',
  no_booking: 'Sem sistema de agendamento',
  outdated_builder: 'Construído em plataforma ultrapassada',
  no_ssl: 'Sem certificado SSL',
  no_mobile_viewport: 'Não otimizado para mobile',
}

export interface InboxItem {
  place_id: string
  business_name: string | null
  outreach_channel: string | null
  status: LeadStatus
  last_message: string | null
  last_message_at: string | null
  unread_count: number
}

/** Subset of Lead columns needed for pipeline cards */
export type LeadCard = Pick<
  Lead,
  | 'place_id'
  | 'business_name'
  | 'city'
  | 'pain_score'
  | 'outreach_channel'
  | 'status'
  | 'status_updated_at'
  | 'niche'
>
