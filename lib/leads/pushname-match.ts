import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fuzzy matching of WhatsApp `pushName` against lead `business_name`.
 *
 * Used in two places:
 *   - Real-time webhook (app/api/webhook/whatsapp/route.ts), match method #5.
 *   - Manual triage (app/api/quarantine/suggest/route.ts) for batch
 *     attribution of backlogged orphan inbounds.
 *
 * Strategy: normalize both strings (lowercase, strip diacritics, collapse
 * non-alphanumerics to spaces), tokenize, then score by three independent
 * signals — substring overlap, token subset containment, and Jaccard
 * similarity. A result is "strong" when substring or subset fires, which
 * empirically avoids most cross-lead collisions.
 */

export const PUSHNAME_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

const PUSHNAME_STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos",
  "nas", "o", "a", "os", "as", "com", "por", "para", "pela",
  "pelo", "um", "uma", "the", "and", "of", "for", "with", "to",
  "i", "my",
]);

export function pushNameNormalize(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pushNameTokens(str: string): string[] {
  return pushNameNormalize(str)
    .split(" ")
    .filter((t) => t.length >= 2 && !PUSHNAME_STOPWORDS.has(t));
}

export interface PushNameScore {
  substring: boolean;
  subset: boolean;
  jaccard: number;
  score: number;
}

export function scorePushNameMatch(
  pushName: string,
  businessName: string,
): PushNameScore {
  const na = pushNameNormalize(pushName);
  const nb = pushNameNormalize(businessName);

  const ss = na.length >= 6 && nb.length >= 6
    && (na.includes(nb) || nb.includes(na));

  const ta = pushNameTokens(pushName);
  const tb = pushNameTokens(businessName);
  let subset = false;
  if (ta.length > 0 && tb.length > 0 && (ta.length >= 2 || tb.length >= 2)) {
    const setA = new Set(ta);
    const setB = new Set(tb);
    subset = ta.every((t) => setB.has(t)) || tb.every((t) => setA.has(t));
  }

  const setA2 = new Set(ta);
  const setB2 = new Set(tb);
  const inter = [...setA2].filter((t) => setB2.has(t)).length;
  const union = new Set([...setA2, ...setB2]).size;
  const jc = union === 0 ? 0 : inter / union;

  const score = (ss ? 2 : 0) + (subset ? 1 : 0) + jc;

  return { substring: ss, subset, jaccard: jc, score };
}

export interface PushNameCandidate<L> {
  lead: L;
  score: PushNameScore;
}

/**
 * Given a set of scored candidates, return the single high-confidence match
 * or null. A match is strong only when substring OR subset fires AND either
 * it's the only strong candidate, or its score is ≥ 1.3× the runner-up (the
 * empirical threshold that stopped cross-lead attributions in production).
 */
export function pickStrongPushNameMatch<L>(
  candidates: PushNameCandidate<L>[],
): L | null {
  const sorted = [...candidates].sort((a, b) => b.score.score - a.score.score);
  const strong = sorted.filter(
    (s) => s.score.substring || s.score.subset,
  );

  if (strong.length === 1) return strong[0].lead;
  if (strong.length > 1) {
    if (strong[0].score.score >= strong[1].score.score * 1.3) {
      return strong[0].lead;
    }
    return null;
  }

  const medium = sorted.filter(
    (s) => !s.score.substring && !s.score.subset && s.score.jaccard >= 0.4,
  );
  if (medium.length === 1) return medium[0].lead;
  if (medium.length > 1 && medium[0].score.score >= medium[1].score.score * 1.5) {
    return medium[0].lead;
  }

  return null;
}

/**
 * Fetch candidate leads on an instance within the pushname lookback window
 * (14 days of outreach), score each against pushName, and return the strong
 * match. Returns null when no lead reaches the confidence bar or multiple
 * candidates tie too closely.
 */
export async function matchLeadByPushName<
  L extends { business_name: string | null },
>(params: {
  supabase: SupabaseClient;
  pushName: string;
  instance: string;
  leadColumns?: string;
}): Promise<(L & { business_name: string }) | null> {
  const { supabase, pushName, instance } = params;
  const columns =
    params.leadColumns ?? "place_id, business_name, evolution_instance";
  const since = new Date(Date.now() - PUSHNAME_LOOKBACK_MS).toISOString();

  const { data: leads } = await supabase
    .from("leads")
    .select(columns)
    .eq("evolution_instance", instance)
    .eq("outreach_sent", true)
    .gte("outreach_sent_at", since);

  if (!leads || leads.length === 0) return null;

  type LeadWithName = L & { business_name: string };
  const scored: PushNameCandidate<LeadWithName>[] = (leads as unknown as L[])
    .filter((l): l is LeadWithName =>
      typeof l.business_name === "string" && l.business_name.length > 0,
    )
    .map((lead) => ({
      lead,
      score: scorePushNameMatch(pushName, lead.business_name),
    }));

  return pickStrongPushNameMatch(scored);
}
