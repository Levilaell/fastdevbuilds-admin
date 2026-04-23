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

export interface MetricsData {
  period: string;
  cohortSize: number; // = funnel.sent
  funnel: {
    sent: number;
    replied: number;
    accepted: number;
    preview_sent: number;
    adjusting: number;
    delivered: number;
    paid: number;
  };
  rates: {
    replied_vs_sent: number;
    accepted_vs_replied: number;
    preview_vs_accepted: number;
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
  // here because a project started outside the period is still the correct
  // stage for a lead whose outreach_sent_at is inside.
  const projectsQuery = supabase
    .from("projects")
    .select("place_id, status, price, paid_at");

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

  // === A. Cumulative funnel + rates ===
  const funnel: MetricsData["funnel"] = {
    sent: 0,
    replied: 0,
    accepted: 0,
    preview_sent: 0,
    adjusting: 0,
    delivered: 0,
    paid: 0,
  };
  for (const p of pairs) addToCumulative(funnel, p.stage);

  const rates: MetricsData["rates"] = {
    replied_vs_sent: rate(funnel.replied, funnel.sent),
    accepted_vs_replied: rate(funnel.accepted, funnel.replied),
    preview_vs_accepted: rate(funnel.preview_sent, funnel.accepted),
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
  };
}
