import { createClient } from "@/lib/supabase/server";
import { extractCity } from "@/lib/extract-city";

export interface MetricsData {
  summary: {
    totalLeads: number;
    responseRate: number;
    negotiating: number;
    totalRevenue: number;
  };
  funnel: { status: string; count: number }[];
  revenue: {
    totalPaid: number;
    totalPending: number;
    avgTicket: number;
    closedThisMonth: number;
    closedLastMonth: number;
    recentProjects: {
      business_name: string;
      price: number;
      created_at: string;
    }[];
  };
  topNiches: { name: string; count: number }[];
  topCities: { name: string; count: number }[];
}

interface LeadRow {
  status: string;
  outreach_sent: boolean | null;
  niche: string | null;
  address: string | null;
}

interface ProjectRow {
  price: number | null;
  status: string | null;
  created_at: string;
}

interface RecentProjectRow {
  price: number | null;
  status: string | null;
  created_at: string;
  leads: { business_name: string | null }[] | null;
}

const FUNNEL_ORDER = [
  "prospected",
  "sent",
  "replied",
  "negotiating",
  "closed",
] as const;

function getDateFilter(period: string): string | null {
  const now = new Date();
  switch (period) {
    case "today":
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).toISOString();
    case "7d":
      return new Date(now.getTime() - 7 * 86_400_000).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * 86_400_000).toISOString();
    default:
      return null;
  }
}

export async function fetchMetrics(period: string): Promise<MetricsData> {
  const supabase = await createClient();
  const dateFilter = getDateFilter(period);

  let leadsQuery = supabase
    .from("leads")
    .select("status, outreach_sent, niche, address");
  if (dateFilter) leadsQuery = leadsQuery.gte("status_updated_at", dateFilter);

  let projectsQuery = supabase
    .from("projects")
    .select("price, status, created_at");
  if (dateFilter) projectsQuery = projectsQuery.gte("created_at", dateFilter);

  const recentQuery = supabase
    .from("projects")
    .select("price, status, created_at, leads(business_name)")
    .order("created_at", { ascending: false })
    .limit(5);

  const [leadsRes, projectsRes, recentRes] = await Promise.all([
    leadsQuery,
    projectsQuery,
    recentQuery,
  ]);

  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (projectsRes.error) throw new Error(projectsRes.error.message);

  const leads = (leadsRes.data ?? []) as LeadRow[];
  const projects = (projectsRes.data ?? []) as ProjectRow[];
  const rawRecent = (recentRes.data ?? []) as RecentProjectRow[];

  // --- Summary ---
  const totalLeads = leads.length;
  const sentCount = leads.filter((l) => l.outreach_sent).length;
  const respondedCount = leads.filter((l) =>
    ["replied", "negotiating", "closed"].includes(l.status),
  ).length;
  const responseRate = sentCount > 0 ? respondedCount / sentCount : 0;
  const negotiating = leads.filter((l) => l.status === "negotiating").length;
  const paidProjects = projects.filter((p) => p.status === "paid");
  const totalRevenue = paidProjects.reduce((s, p) => s + (p.price ?? 0), 0);

  // --- Funnel ---
  const counts = new Map<string, number>();
  for (const s of FUNNEL_ORDER) counts.set(s, 0);
  for (const l of leads) {
    if (counts.has(l.status))
      counts.set(l.status, (counts.get(l.status) ?? 0) + 1);
  }
  const funnel = FUNNEL_ORDER.map((s) => ({
    status: s,
    count: counts.get(s) ?? 0,
  }));

  // --- Revenue ---
  const pendingProjects = projects.filter(
    (p) =>
      p.status === "approved" ||
      p.status === "preview_sent" ||
      p.status === "adjusting" ||
      p.status === "delivered",
  );
  const totalPending = pendingProjects.reduce((s, p) => s + (p.price ?? 0), 0);
  const avgTicket =
    paidProjects.length > 0 ? totalRevenue / paidProjects.length : 0;

  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const closedThisMonth = paidProjects.filter(
    (p) => new Date(p.created_at) >= thisMonth,
  ).length;
  const closedLastMonth = paidProjects.filter((p) => {
    const d = new Date(p.created_at);
    return d >= lastMonth && d < thisMonth;
  }).length;

  const recentProjects = rawRecent.map((p) => ({
    business_name: p.leads?.[0]?.business_name ?? "Desconhecido",
    price: p.price ?? 0,
    created_at: p.created_at,
  }));

  // --- Top niches (exclude inbound — those are webhook-created, not prospected) ---
  const nicheCounts = new Map<string, number>();
  for (const l of leads) {
    if (l.niche && l.niche !== "inbound")
      nicheCounts.set(l.niche, (nicheCounts.get(l.niche) ?? 0) + 1);
  }
  const topNiches = [...nicheCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // --- Top cities (extract from address) ---
  const cityCounts = new Map<string, number>();
  for (const l of leads) {
    if (!l.address) continue;
    const city = extractCity(l.address);
    if (city) cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
  }
  const topCities = [...cityCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    summary: { totalLeads, responseRate, negotiating, totalRevenue },
    funnel,
    revenue: {
      totalPaid: totalRevenue,
      totalPending,
      avgTicket,
      closedThisMonth,
      closedLastMonth,
      recentProjects,
    },
    topNiches,
    topCities,
  };
}
