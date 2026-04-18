export const LEAD_STATUSES = [
  "prospected",
  "sent",
  "replied",
  "negotiating",
  "scoped",
  "closed",
  "lost",
  "disqualified",
] as const;

/** Statuses shown as pipeline columns (excludes 'lost' — archived leads go there automatically) */
export const PIPELINE_STATUSES: LeadStatus[] = [
  "prospected",
  "sent",
  "replied",
  "negotiating",
  "scoped",
  "closed",
];

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  prospected: "Prospectado",
  sent: "Enviado",
  replied: "Respondeu",
  negotiating: "Negociando",
  scoped: "Escopo",
  closed: "Fechado",
  lost: "Perdido",
  disqualified: "Desqualificado",
};

export const STATUS_COLORS: Record<LeadStatus, string> = {
  prospected: "bg-slate-500/20 text-slate-400",
  sent: "bg-blue-500/20 text-blue-400",
  replied: "bg-yellow-500/20 text-yellow-400",
  negotiating: "bg-orange-500/20 text-orange-400",
  scoped: "bg-purple-500/20 text-purple-400",
  closed: "bg-green-500/20 text-green-400",
  lost: "bg-red-500/20 text-red-400",
  disqualified: "bg-zinc-500/20 text-zinc-500",
};

export interface Lead {
  place_id: string;
  business_name: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  perf_score: number | null;
  mobile_score: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  has_ssl: boolean | null;
  is_mobile_friendly: boolean | null;
  has_pixel: boolean | null;
  has_analytics: boolean | null;
  has_whatsapp: boolean | null;
  has_form: boolean | null;
  has_booking: boolean | null;
  tech_stack: string | null;
  scrape_failed: boolean | null;
  visual_score: number | null;
  visual_notes: string | null;
  pain_score: number | null;
  score_reasons: string | null;
  message: string | null;
  email: string | null;
  email_source: string | null;
  outreach_sent: boolean | null;
  outreach_sent_at: string | null;
  outreach_channel: string | null;
  niche: string | null;
  status: LeadStatus;
  status_updated_at: string | null;
  inbox_archived_at: string | null;
  email_subject: string | null;
  country: string | null;
  evolution_instance: string | null;
  whatsapp_jid: string | null;

  // operational messaging state
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  last_human_reply_at: string | null;
  last_auto_reply_at: string | null;
  follow_up_count: number | null;
  next_follow_up_at: string | null;
  follow_up_paused: boolean | null;
  outreach_error: string | null;
}

export interface Conversation {
  id: string;
  place_id: string;
  direction: "in" | "out";
  channel: "whatsapp" | "email";
  message: string;
  subject: string | null;
  sent_at: string;
  read_at: string | null;
  suggested_by_ai: boolean | null;
  approved_by: string | null;
  provider_message_id: string | null;
}

export const SCORE_REASON_LABELS: Record<string, string> = {
  slow_mobile_severe: "Site muito lento no celular",
  slow_mobile_moderate: "Site lento no celular",
  slow_mobile_mild: "Site com velocidade moderada",
  no_whatsapp: "Sem WhatsApp no site",
  no_form: "Sem formulário de contato",
  no_booking: "Sem sistema de agendamento",
  outdated_builder: "Plataforma limitada (precisa refazer)",
  no_ssl: "Sem certificado SSL (site inseguro)",
  no_mobile_viewport: "Não otimizado para mobile",
  outdated_design: "Design ultrapassado (precisa redesign)",
  poor_visual_quality: "Qualidade visual baixa",
};

export interface InboxItem {
  place_id: string;
  business_name: string | null;
  outreach_channel: string | null;
  evolution_instance: string | null;
  status: LeadStatus;
  last_message: string | null;
  last_message_at: string | null;
  last_direction: string | null;
  unread_count: number;
  archived: boolean;
  waiting_since: string | null;
}

export interface BotRun {
  id: string;
  niche: string | null;
  city: string | null;
  limit_count: number | null;
  min_score: number | null;
  dry_run: boolean | null;
  send: boolean | null;
  collected: number | null;
  qualified: number | null;
  sent: number | null;
  status: "running" | "completed" | "failed";
  started_at: string;
  duration_seconds: number | null;
  log: string | null;
  server_run_id: string | null;
}

// ─── AI Suggestions ───

export interface AiSuggestion {
  id: string;
  place_id: string;
  conversation_id: string | null;
  intent: string;
  confidence: number;
  suggested_reply: string;
  status: "pending" | "approved" | "rejected" | "sent";
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
}

export const INTENT_COLORS: Record<string, string> = {
  interested: "text-emerald-400 bg-emerald-500/10",
  asked_price: "text-blue-400 bg-blue-500/10",
  asked_scope: "text-blue-400 bg-blue-500/10",
  objection: "text-yellow-400 bg-yellow-500/10",
  not_interested: "text-red-400 bg-red-500/10",
  scheduling: "text-purple-400 bg-purple-500/10",
  other: "text-muted bg-border",
};

export const INTENT_LABELS: Record<string, string> = {
  interested: "Interessado",
  asked_price: "Preço",
  asked_scope: "Escopo",
  objection: "Objeção",
  not_interested: "Não interessado",
  scheduling: "Agendamento",
  other: "Outro",
};

// ─── Projects ───

export interface Project {
  id: string;
  place_id: string;
  scope: string | null;
  price: number | null;
  currency: string | null;
  status: ProjectStatus;
  created_at: string;
  proposal_message: string | null;
  claude_code_prompt: string | null;
  pending_info: string | null;
  info_request_message: string | null;
  prompt_updated_at: string | null;
  client_approved_at: string | null;
}

export const PROJECT_STATUSES = [
  "scoped",
  "approved",
  "in_progress",
  "delivered",
  "client_approved",
  "paid",
  "cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  scoped: "Escopo",
  approved: "Aprovado",
  in_progress: "Em progresso",
  delivered: "Entregue",
  client_approved: "Aprovado pelo cliente",
  paid: "Pago",
  cancelled: "Cancelado",
};

// ─── Pipeline cards ───

export type LeadCard = Pick<
  Lead,
  | "place_id"
  | "business_name"
  | "city"
  | "pain_score"
  | "outreach_channel"
  | "evolution_instance"
  | "status"
  | "status_updated_at"
  | "niche"
> & {
  project_status?: ProjectStatus | null;
  has_unread?: boolean;
  has_pending_suggestion?: boolean;
  has_proposal?: boolean;
};
