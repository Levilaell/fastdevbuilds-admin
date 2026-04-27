export const LEAD_STATUSES = [
  "prospected",
  "sent",
  "replied",
  "negotiating",
  "closed",
  "lost",
  "disqualified",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  prospected: "Prospectado",
  sent: "Enviado",
  replied: "Respondeu",
  negotiating: "Negociando",
  closed: "Fechado",
  lost: "Perdido",
  disqualified: "Desqualificado",
};

export const STATUS_COLORS: Record<LeadStatus, string> = {
  prospected: "bg-slate-500/20 text-slate-400",
  sent: "bg-blue-500/20 text-blue-400",
  replied: "bg-yellow-500/20 text-yellow-400",
  negotiating: "bg-orange-500/20 text-orange-400",
  closed: "bg-green-500/20 text-green-400",
  lost: "bg-red-500/20 text-red-400",
  disqualified: "bg-zinc-500/20 text-zinc-500",
};

export interface LeadHours {
  weekday_text: string[];
  open_now: boolean;
}

export interface LeadReview {
  author_name: string;
  rating: number;
  text: string;
  relative_time_description: string;
  time: number;
}

export interface Lead {
  place_id: string;
  business_name: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  hours: LeadHours | null;
  reviews: LeadReview[] | null;
  photos_urls: string[] | null;
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
  opportunity_score: number | null;
  opportunity_reasons: string | null;
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
  whatsapp_lid_jid: string | null;

  // operational messaging state
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  last_human_reply_at: string | null;
  last_auto_reply_at: string | null;
  outreach_error: string | null;
}

export interface Conversation {
  id: string;
  place_id: string;
  direction: "in" | "out";
  channel: "whatsapp" | "email" | "sms";
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
  project_status: ProjectStatus | null;
  last_message: string | null;
  last_message_at: string | null;
  last_direction: string | null;
  unread_count: number;
  archived: boolean;
}

export interface BotRun {
  id: string;
  collected: number | null;
  qualified: number | null;
  sent: number | null;
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
  server_run_id: string | null;
}

// ─── Projects ───

export type ModelTier = "fast" | "balanced" | "premium";

export interface GeneratedImages {
  hero: string;
  services: Array<{ name: string; url: string }>;
}

export interface Project {
  id: string;
  place_id: string;
  scope: string | null;
  notes: string | null;
  price: number | null;
  currency: string | null;
  status: ProjectStatus;
  created_at: string;
  approved_at: string | null;
  preview_sent_at: string | null;
  delivered_at: string | null;
  paid_at: string | null;
  claude_code_prompt: string | null;
  pending_info: string | null;
  info_request_message: string | null;
  prompt_updated_at: string | null;
  generated_images: GeneratedImages | null;
  /**
   * Vercel preview URL of the generated site. In the US-WhatsApp
   * preview-first flow this URL is what the outreach message embeds —
   * the lead clicks straight into a working site.
   * Populated when Levi pastes it from his local Claude Code run.
   */
  preview_url: string | null;
}

export const PROJECT_STATUSES = [
  "approved",
  "preview_sent",
  "adjusting",
  "delivered",
  "paid",
  "cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  approved: "Aceitou",
  preview_sent: "Preview enviado",
  adjusting: "Ajustando",
  delivered: "Versão final enviada",
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
  | "country"
> & {
  project_status?: ProjectStatus | null;
  has_unread?: boolean;
  /** Present when the Project row has a Claude Code prompt generated. */
  project_claude_code_prompt?: string | null;
  /** Present when Levi pasted the Vercel preview URL. */
  project_preview_url?: string | null;
  /** Timestamp of when the outreach with preview was dispatched. */
  project_preview_sent_at?: string | null;
  /** Earliest beacon hit logged by public/track.js — when the lead first
   *  opened the preview. Null = never opened (or tracker missing). */
  preview_first_view_at?: string | null;
  /** Total beacon hits across all opens. */
  preview_view_count?: number;
};

// Kanban columns are a derived view over (lead.status, project.status) pairs,
// not a 1:1 mapping with either enum. "Respondeu" specifically means "a real
// human reply landed and the user hasn't built a preview yet" — that's the
// triage backlog. Auto-replies don't count: they never set lead.status to
// `replied` (the webhook routes them to the auto-reply branch that stamps
// last_auto_reply_at only), so they stay in Enviado until a real reply
// arrives or the user gives up.
export const PIPELINE_COLUMNS = [
  "prospected",
  "sent",
  "replied",
  "preview_sent",
  "adjusting",
  "delivered",
] as const;
export type PipelineColumn = (typeof PIPELINE_COLUMNS)[number];

export const PIPELINE_COLUMN_LABELS: Record<PipelineColumn, string> = {
  prospected: "Prospectado",
  sent: "Enviado",
  replied: "Respondeu",
  preview_sent: "Preview enviado",
  adjusting: "Ajustando",
  delivered: "Versão final enviada",
};

export const PIPELINE_COLUMN_COLORS: Record<PipelineColumn, string> = {
  prospected: "bg-slate-500/20 text-slate-400",
  sent: "bg-blue-500/20 text-blue-400",
  replied: "bg-yellow-500/20 text-yellow-400",
  preview_sent: "bg-violet-500/20 text-violet-400",
  adjusting: "bg-fuchsia-500/20 text-fuchsia-400",
  delivered: "bg-emerald-500/20 text-emerald-400",
};

// US pipeline is preview-first: bot qualifies → admin creates Project + prompt
// → Levi runs Claude Code locally + pastes URL → admin sends outreach with
// URL embedded. There is no "prospected" or "sent" state here — the lead
// doesn't exist in the pipeline until the Project (with prompt) is built,
// and sending always includes a preview URL.
export const US_PIPELINE_COLUMNS = [
  "prompt_ready",
  "preview_sent",
  "replied",
  "adjusting",
  "delivered",
] as const;
export type USPipelineColumn = (typeof US_PIPELINE_COLUMNS)[number];

export const US_PIPELINE_COLUMN_LABELS: Record<USPipelineColumn, string> = {
  prompt_ready: "Prompt pronto",
  preview_sent: "Preview enviado",
  replied: "Respondeu",
  adjusting: "Ajustando",
  delivered: "Versão final enviada",
};

export const US_PIPELINE_COLUMN_COLORS: Record<USPipelineColumn, string> = {
  prompt_ready: "bg-amber-500/20 text-amber-400",
  preview_sent: "bg-violet-500/20 text-violet-400",
  replied: "bg-yellow-500/20 text-yellow-400",
  adjusting: "bg-fuchsia-500/20 text-fuchsia-400",
  delivered: "bg-emerald-500/20 text-emerald-400",
};

/** US pipeline columns driven by project state; adjusting/delivered take
 * precedence over anything earlier. */
export const US_PROJECT_COLUMNS: USPipelineColumn[] = [
  "preview_sent",
  "adjusting",
  "delivered",
];

/**
 * Resolve the US-market kanban column for a lead. Returns null when the
 * lead is terminal (closed/lost/disqualified) or the project is terminal
 * (paid/cancelled), matching the BR pipeline's hiding rules.
 *
 * Semantics:
 *   - prompt_ready: project exists with a prompt generated, no preview URL
 *     pasted yet → Levi needs to run Claude Code and paste the URL
 *   - preview_sent: URL pasted + outreach msg sent; lead is stewing
 *     (includes leads that already replied — they jump to replied)
 *   - replied: real reply landed and no preview/adjusting happening yet
 *   - adjusting / delivered: mirror BR semantics
 */
export function getUSPipelineColumn(
  leadStatus: LeadStatus,
  projectStatus: ProjectStatus | null | undefined,
  projectClaudeCodePrompt: string | null | undefined,
  projectPreviewUrl: string | null | undefined,
  projectPreviewSentAt: string | null | undefined,
): USPipelineColumn | null {
  if (
    leadStatus === "closed" ||
    leadStatus === "lost" ||
    leadStatus === "disqualified"
  ) {
    return null;
  }
  if (projectStatus === "paid" || projectStatus === "cancelled") {
    return null;
  }

  if (projectStatus === "delivered") return "delivered";
  if (projectStatus === "adjusting") return "adjusting";

  if (leadStatus === "replied" || leadStatus === "negotiating") {
    // Preview already went out and lead responded → Respondeu.
    // If project says preview_sent but lead also replied, replied wins —
    // the conversation is now the actionable thing, not the preview.
    return "replied";
  }

  if (projectStatus === "preview_sent" || projectPreviewSentAt) {
    return "preview_sent";
  }

  if (projectClaudeCodePrompt && !projectPreviewUrl) {
    return "prompt_ready";
  }

  if (projectClaudeCodePrompt && projectPreviewUrl && !projectPreviewSentAt) {
    // Edge: URL pasted but admin hasn't dispatched yet — still ours to act on.
    return "prompt_ready";
  }

  return null;
}

/** Columns whose drop target is a project-state change (require active project). */
export const PROJECT_COLUMNS: PipelineColumn[] = [
  "preview_sent",
  "adjusting",
  "delivered",
];

/**
 * Resolve which column a lead belongs in. Returns null when the lead is
 * terminal/archived (paid, closed, lost, disqualified, cancelled project) —
 * the pipeline hides those.
 */
export function getPipelineColumn(
  leadStatus: LeadStatus,
  projectStatus: ProjectStatus | null | undefined,
): PipelineColumn | null {
  // Terminal / archived states leave the pipeline entirely.
  if (leadStatus === "closed" || leadStatus === "lost" || leadStatus === "disqualified") {
    return null;
  }
  if (projectStatus === "paid" || projectStatus === "cancelled") {
    return null;
  }

  // Project-state columns take precedence — once a preview has shipped, the
  // lead is driven by project.status regardless of lead.status.
  if (projectStatus === "delivered") return "delivered";
  if (projectStatus === "adjusting") return "adjusting";
  if (projectStatus === "preview_sent") return "preview_sent";

  // Real human reply with no preview yet → Respondeu (triage backlog).
  // project=approved sits here too: the user created the project but hasn't
  // sent the preview yet, which is the same as "waiting for me to act".
  if (
    projectStatus === "approved" ||
    leadStatus === "negotiating" ||
    leadStatus === "replied"
  ) {
    return "replied";
  }
  if (leadStatus === "sent") return "sent";
  if (leadStatus === "prospected") return "prospected";

  return null;
}
