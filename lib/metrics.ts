import { createClient } from "@/lib/supabase/server";
import { extractCity } from "@/lib/extract-city";

/**
 * Metrics are cohort-based: the period filter selects a set of leads by
 * `outreach_sent_at` and every rate below is computed over *that* cohort.
 * Rates the user sees ("24% replied") always mean "24% of the leads the bot
 * sent in this window". Leads prospected but not yet sent are intentionally
 * excluded — they have no `outreach_sent_at` and can't be placed on the
 * timeline without a `collected_at` column (schema doesn't have one).
 */

// ─── Cost assumptions for financial health ──────────────────────────────────
// Hardcoded defaults — edit here when reality drifts. No UI yet because the
// Phase 1 goal is to validate the BR-WA-PREVIEW funnel, not to instrument
// every cost. If/when costs become a moving target, lift to a `cost_assumptions`
// table and expose in /metrics settings.

/** Average IA cost per generated preview (Opus prompt + Getimg images).
 *  US$ 0.72 × ~6.0 BRL/USD ≈ R$ 4.32. Recompute when models or rates shift. */
export const AI_COST_PER_PREVIEW_BRL = 4.32;

/** Annual hosting cost per site. Vercel Hobby = R$ 0; Pro plan amortized
 *  over typical client headcount lands around R$ 0–60/site/year. */
export const HOSTING_COST_PER_YEAR_BRL = 0;

/** Annual domain cost (.com.br via Registro.br). Update if you switch
 *  registrars or use international TLDs. */
export const DOMAIN_COST_PER_YEAR_BRL = 40;

/** Effective payment fee blended across Pix and 3x cartão.
 *  Pix ≈ 0%; 3x cartão ≈ 7%. Assume 50/50 split until we have real data. */
export const PAYMENT_FEE_PCT = 0.035;

/** Reserve set aside per sale to fund refunds (R$ 500 upfront refundable).
 *  Conservative 5% buys roughly 1-in-20 refunds without dipping into margin. */
export const REFUND_RESERVE_PCT = 0.05;

export interface SegmentRow {
  name: string;
  sent: number;
  replied: number;
  accepted: number;
  paid: number;
  responseRate: number;
  acceptanceRate: number;
  closeRate: number;
}

/**
 * Aggregate financial-health snapshot. All values in BRL unless noted.
 *
 * `cacAiPerPaid` is the IA cost per closed sale — total IA spend on previews
 * (including those that didn't convert) divided by paid count. This is the
 * key viability number: if it's eating margin, the model can't scale.
 *
 * `grossMarginPerPaid` is avg ticket minus all per-sale costs (IA, hosting,
 * domain, payment fees, refund reserve). Doesn't include Levi's time, since
 * Phase 1 doesn't pay him a salary.
 */
export interface FinancialHealth {
  /** Previews generated within the selected period (projects with claude_code_prompt). */
  previewsGenerated: number;
  /** Approximate IA spend on those previews (previewsGenerated × per-preview cost). */
  aiSpentBRL: number;
  /** Sales closed within the period — denominator for cacAiPerPaid. Distinct
   *  from `revenue.paidCount` which stays global to keep "Ticket médio" stable. */
  paidInPeriodCount: number;
  /** IA cost amortized per period-closed sale (aiSpentBRL ÷ paidInPeriodCount). 0 if no sales yet. */
  cacAiPerPaid: number;
  /** Per-sale gross margin: avgTicket − cacAi − hosting − domain − fee − reserve.
   *  Uses global avgTicket as anchor (small-N period averages would be noisy). */
  grossMarginPerPaid: number;
  /** Margin as fraction of avgTicket. Use to decide scale: <0.30 cut/optimize, 0.30–0.50 ok, >0.50 healthy. */
  grossMarginPctPerPaid: number;
  /** Surfaced for UI tooltip — what the calc assumes about non-IA costs. */
  assumptions: {
    aiCostPerPreviewBRL: number;
    hostingPerYearBRL: number;
    domainPerYearBRL: number;
    paymentFeePct: number;
    refundReservePct: number;
  };
}

export interface MetricsData {
  period: string;
  cohortSize: number; // = funnel.sent
  funnel: {
    sent: number;
    replied: number;
    accepted: number;
    preview_sent: number;
    /** Subset of preview_sent that logged at least one beacon hit — i.e.,
     *  the lead actually opened the link. Sourced from preview_views. */
    preview_opened: number;
    adjusting: number;
    delivered: number;
    paid: number;
  };
  rates: {
    replied_vs_sent: number;
    accepted_vs_replied: number;
    preview_vs_accepted: number;
    /** Open rate of the sent preview — preview_opened ÷ preview_sent. */
    opened_vs_preview_sent: number;
    adjusting_vs_preview: number;
    delivered_vs_adjusting: number;
    paid_vs_delivered: number;
    overall_sent_to_paid: number;
  };
  byNiche: SegmentRow[];
  byCity: SegmentRow[];
  byInstance: SegmentRow[];
  byChannel: SegmentRow[];
  revenue: {
    thisMonth: number;
    lastMonth: number;
    totalPaid: number;
    avgTicket: number;
    paidCount: number;
    pendingCount: number;
    monthlyTrend: { month: string; revenue: number; count: number }[];
    recentPaid: {
      business_name: string;
      price: number;
      paid_at: string;
    }[];
  };
  /** Financial health — IA cost amortization + per-sale margin. Phase 1 lever. */
  financialHealth: FinancialHealth;
}

interface LeadRow {
  place_id: string;
  status: string;
  outreach_sent: boolean | null;
  outreach_sent_at: string | null;
  outreach_channel: string | null;
  evolution_instance: string | null;
  last_human_reply_at: string | null;
  niche: string | null;
  city: string | null;
  address: string | null;
  business_name: string | null;
}

interface ProjectRow {
  place_id: string;
  status: string | null;
  price: number | null;
  paid_at: string | null;
  claude_code_prompt: string | null;
  created_at: string | null;
}

function getPeriodStart(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "7d":
      return new Date(now.getTime() - 7 * 86_400_000);
    case "30d":
      return new Date(now.getTime() - 30 * 86_400_000);
    default:
      return null;
  }
}

/** Which funnel-stage a lead is currently in, derived from lead + project state. */
type FunnelStage =
  | "sent"
  | "replied"
  | "accepted"
  | "preview_sent"
  | "adjusting"
  | "delivered"
  | "paid";

function stageOf(lead: LeadRow, project: ProjectRow | undefined): FunnelStage {
  if (project) {
    if (project.status === "paid") return "paid";
    if (project.status === "delivered") return "delivered";
    if (project.status === "adjusting") return "adjusting";
    if (project.status === "preview_sent") return "preview_sent";
    if (project.status === "approved") return "accepted";
  }
  if (lead.last_human_reply_at) return "replied";
  return "sent";
}

/** Cumulative funnel: a lead at stage X also counts for all earlier stages. */
function addToCumulative(
  f: MetricsData["funnel"],
  stage: FunnelStage,
): void {
  f.sent++;
  if (stage === "sent") return;
  f.replied++;
  if (stage === "replied") return;
  f.accepted++;
  if (stage === "accepted") return;
  f.preview_sent++;
  if (stage === "preview_sent") return;
  f.adjusting++;
  if (stage === "adjusting") return;
  f.delivered++;
  if (stage === "delivered") return;
  f.paid++;
}

function rate(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

function buildSegment(
  rows: { lead: LeadRow; stage: FunnelStage }[],
): { sent: number; replied: number; accepted: number; paid: number } {
  let sent = 0,
    replied = 0,
    accepted = 0,
    paid = 0;
  for (const { stage } of rows) {
    sent++;
    const beyondSent = stage !== "sent";
    const beyondReplied = beyondSent && stage !== "replied";
    if (beyondSent) replied++;
    if (beyondReplied) accepted++;
    if (stage === "paid") paid++;
  }
  return { sent, replied, accepted, paid };
}

function toSegmentRow(
  name: string,
  s: { sent: number; replied: number; accepted: number; paid: number },
): SegmentRow {
  return {
    name,
    sent: s.sent,
    replied: s.replied,
    accepted: s.accepted,
    paid: s.paid,
    responseRate: rate(s.replied, s.sent),
    acceptanceRate: rate(s.accepted, s.replied),
    closeRate: rate(s.paid, s.sent),
  };
}

function groupByKey(
  pairs: { lead: LeadRow; stage: FunnelStage }[],
  keyOf: (lead: LeadRow) => string | null,
): Map<string, { lead: LeadRow; stage: FunnelStage }[]> {
  const map = new Map<string, { lead: LeadRow; stage: FunnelStage }[]>();
  for (const p of pairs) {
    const k = keyOf(p.lead);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }
  return map;
}

function topSegments(
  map: Map<string, { lead: LeadRow; stage: FunnelStage }[]>,
  limit = 10,
): SegmentRow[] {
  return [...map.entries()]
    .map(([name, rows]) => toSegmentRow(name, buildSegment(rows)))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, limit);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthKeyFromIso(iso: string): string {
  return monthKey(new Date(iso));
}

export async function fetchMetrics(period: string): Promise<MetricsData> {
  const supabase = await createClient();
  const periodStart = getPeriodStart(period);

  // Leads cohort: everyone the bot has sent to. Period filter, when set, is
  // applied to outreach_sent_at so "30 dias" means "sent in the last 30 days",
  // not "any lead whose status happened to change in the last 30 days".
  let leadsQuery = supabase
    .from("leads")
    .select(
      "place_id, status, outreach_sent, outreach_sent_at, outreach_channel, evolution_instance, last_human_reply_at, niche, city, address, business_name",
    )
    .eq("outreach_sent", true)
    .not("outreach_sent_at", "is", null);
  if (periodStart) {
    leadsQuery = leadsQuery.gte("outreach_sent_at", periodStart.toISOString());
  }

  // All projects — needed for funnel staging + revenue. We don't period-filter
  // the query because a project started outside the period is still the correct
  // stage for a lead whose outreach_sent_at is inside. `created_at` is read so
  // financial-health can filter previewsGenerated to the period in-memory.
  // `claude_code_prompt` is fetched so we can count IA-generated previews
  // (each ~R$ 4.32) for the financial-health calc, even when the lead never
  // converted.
  const projectsQuery = supabase
    .from("projects")
    .select("place_id, status, price, paid_at, claude_code_prompt, created_at");

  const [leadsRes, projectsRes] = await Promise.all([
    leadsQuery,
    projectsQuery,
  ]);

  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (projectsRes.error) throw new Error(projectsRes.error.message);

  const leads = (leadsRes.data ?? []) as LeadRow[];
  const projects = (projectsRes.data ?? []) as ProjectRow[];

  const projectByPlace = new Map<string, ProjectRow>();
  for (const p of projects) projectByPlace.set(p.place_id, p);

  const pairs: { lead: LeadRow; stage: FunnelStage }[] = leads.map((l) => ({
    lead: l,
    stage: stageOf(l, projectByPlace.get(l.place_id)),
  }));

  // Preview-open beacon hits — distinct place_ids in preview_views that
  // intersect with the cohort. The endpoint /api/preview-view is gated by
  // ?v={place_id}, so each row represents a real lead-side click. We only
  // need the set of place_ids; counts/timestamps drive the LeadCard but
  // aren't relevant for the global funnel.
  const cohortPlaceIds = leads.map((l) => l.place_id);
  const openedPlaceIds = new Set<string>();
  if (cohortPlaceIds.length > 0) {
    const { data: viewsData } = await supabase
      .from("preview_views")
      .select("place_id")
      .in("place_id", cohortPlaceIds);
    for (const row of viewsData ?? []) {
      openedPlaceIds.add((row as { place_id: string }).place_id);
    }
  }

  // === A. Cumulative funnel + rates ===
  const funnel: MetricsData["funnel"] = {
    sent: 0,
    replied: 0,
    accepted: 0,
    preview_sent: 0,
    preview_opened: 0,
    adjusting: 0,
    delivered: 0,
    paid: 0,
  };
  for (const p of pairs) addToCumulative(funnel, p.stage);
  // preview_opened sits orthogonally to the cumulative funnel — it's a count
  // of cohort leads who clicked the link, regardless of where they ended up.
  for (const p of pairs) {
    if (openedPlaceIds.has(p.lead.place_id)) funnel.preview_opened++;
  }

  const rates: MetricsData["rates"] = {
    replied_vs_sent: rate(funnel.replied, funnel.sent),
    accepted_vs_replied: rate(funnel.accepted, funnel.replied),
    preview_vs_accepted: rate(funnel.preview_sent, funnel.accepted),
    opened_vs_preview_sent: rate(funnel.preview_opened, funnel.preview_sent),
    adjusting_vs_preview: rate(funnel.adjusting, funnel.preview_sent),
    delivered_vs_adjusting: rate(funnel.delivered, funnel.adjusting),
    paid_vs_delivered: rate(funnel.paid, funnel.delivered),
    overall_sent_to_paid: rate(funnel.paid, funnel.sent),
  };

  // === B. Segmentation ===
  const byNiche = topSegments(
    groupByKey(pairs, (l) => {
      const n = l.niche?.trim();
      return n && n !== "inbound" ? n : null;
    }),
  );
  const byCity = topSegments(
    groupByKey(pairs, (l) => {
      const c = l.city?.trim();
      if (c) return c;
      if (l.address) return extractCity(l.address);
      return null;
    }),
  );
  const byInstance = topSegments(
    groupByKey(pairs, (l) => l.evolution_instance?.trim() || null),
  );
  const byChannel = topSegments(
    groupByKey(pairs, (l) => {
      const ch = l.outreach_channel?.trim();
      return ch && ch !== "pending" ? ch : null;
    }),
  );

  // === D. Revenue ===
  const paidProjects = projects.filter((p) => p.status === "paid" && p.paid_at);
  const pendingProjects = projects.filter(
    (p) =>
      p.status === "approved" ||
      p.status === "preview_sent" ||
      p.status === "adjusting" ||
      p.status === "delivered",
  );

  const now = new Date();
  const thisMonthKey = monthKey(now);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = monthKey(lastMonthDate);

  let thisMonth = 0;
  let lastMonth = 0;
  for (const p of paidProjects) {
    const mk = monthKeyFromIso(p.paid_at as string);
    const price = p.price ?? 0;
    if (mk === thisMonthKey) thisMonth += price;
    else if (mk === lastMonthKey) lastMonth += price;
  }

  const totalPaid = paidProjects.reduce((s, p) => s + (p.price ?? 0), 0);
  const avgTicket =
    paidProjects.length > 0 ? totalPaid / paidProjects.length : 0;

  // Monthly trend — last 6 calendar months including current
  const trendKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    trendKeys.push(monthKey(d));
  }
  const trendAgg = new Map<string, { revenue: number; count: number }>();
  for (const k of trendKeys) trendAgg.set(k, { revenue: 0, count: 0 });
  for (const p of paidProjects) {
    const mk = monthKeyFromIso(p.paid_at as string);
    const row = trendAgg.get(mk);
    if (row) {
      row.revenue += p.price ?? 0;
      row.count++;
    }
  }
  const monthlyTrend = trendKeys.map((month) => ({
    month,
    revenue: trendAgg.get(month)!.revenue,
    count: trendAgg.get(month)!.count,
  }));

  // Recent 5 paid — needs a second query to join business_name
  const { data: recentRaw } = await supabase
    .from("projects")
    .select("price, paid_at, leads(business_name)")
    .eq("status", "paid")
    .not("paid_at", "is", null)
    .order("paid_at", { ascending: false })
    .limit(5);

  const recentPaid = (recentRaw ?? []).map((r) => {
    const row = r as unknown as {
      price: number | null;
      paid_at: string;
      leads: { business_name: string | null } | { business_name: string | null }[] | null;
    };
    const leadObj = Array.isArray(row.leads) ? row.leads[0] : row.leads;
    return {
      business_name: leadObj?.business_name ?? "Desconhecido",
      price: row.price ?? 0,
      paid_at: row.paid_at,
    };
  });

  // === E. Financial health ===
  // Count every project whose Claude Code prompt was generated within the
  // selected period — that's the moment IA money actually leaves the bank.
  // Period-filtered (via projects.created_at) so the dashboard's period
  // toggle drives the financial KPIs as well, matching the kill-switch
  // criteria ("14 dias / 100 mensagens").
  // Falls back to created_at IS NOT NULL — older projects without that
  // column still count globally when period='all'.
  const periodStartIso = periodStart ? periodStart.toISOString() : null;
  const projectsInPeriod = periodStartIso
    ? projects.filter((p) => p.created_at && p.created_at >= periodStartIso)
    : projects;
  const previewsGenerated = projectsInPeriod.filter((p) => !!p.claude_code_prompt).length;
  const aiSpentBRL = previewsGenerated * AI_COST_PER_PREVIEW_BRL;

  // CAC IA per paid sale — also period-coherent: paidInPeriod uses paid_at
  // because that's when revenue lands. avgTicket below stays global to keep
  // the existing "Ticket médio" KPI stable.
  const paidInPeriod = periodStartIso
    ? paidProjects.filter((p) => p.paid_at && p.paid_at >= periodStartIso)
    : paidProjects;
  const cacAiPerPaid =
    paidInPeriod.length > 0 ? aiSpentBRL / paidInPeriod.length : 0;

  // Per-sale gross margin. Hosting + domain are "amortized over 1 year per
  // client" — same horizon as what the offer promises ("hosting + domain por
  // 1 ano"). After year 1 it's a separate maintenance conversation.
  const perSaleAmortizedFixed =
    HOSTING_COST_PER_YEAR_BRL + DOMAIN_COST_PER_YEAR_BRL;
  const grossMarginPerPaid =
    avgTicket > 0
      ? avgTicket
        - cacAiPerPaid
        - perSaleAmortizedFixed
        - avgTicket * PAYMENT_FEE_PCT
        - avgTicket * REFUND_RESERVE_PCT
      : 0;
  const grossMarginPctPerPaid =
    avgTicket > 0 ? grossMarginPerPaid / avgTicket : 0;

  const financialHealth: FinancialHealth = {
    previewsGenerated,
    aiSpentBRL,
    paidInPeriodCount: paidInPeriod.length,
    cacAiPerPaid,
    grossMarginPerPaid,
    grossMarginPctPerPaid,
    assumptions: {
      aiCostPerPreviewBRL: AI_COST_PER_PREVIEW_BRL,
      hostingPerYearBRL: HOSTING_COST_PER_YEAR_BRL,
      domainPerYearBRL: DOMAIN_COST_PER_YEAR_BRL,
      paymentFeePct: PAYMENT_FEE_PCT,
      refundReservePct: REFUND_RESERVE_PCT,
    },
  };

  return {
    period,
    cohortSize: funnel.sent,
    funnel,
    rates,
    byNiche,
    byCity,
    byInstance,
    byChannel,
    revenue: {
      thisMonth,
      lastMonth,
      totalPaid,
      avgTicket,
      paidCount: paidProjects.length,
      pendingCount: pendingProjects.length,
      monthlyTrend,
      recentPaid,
    },
    financialHealth,
  };
}
