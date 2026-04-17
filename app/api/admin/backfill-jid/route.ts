import { verifyBotAuth } from "@/lib/auth/bot-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isValidPhone, lookupJidFromPhone, normalizePhone } from "@/lib/whatsapp";

// Long-running: 301 leads × ~500ms Evolution latency + 300ms throttle ≈ 4min
export const maxDuration = 300;

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const THROTTLE_MS = 300;

interface LeadRow {
  place_id: string;
  phone: string;
  evolution_instance: string;
}

interface InstanceStat {
  processed: number;
  updated: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLimit(raw: string | null): number {
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export async function POST(request: Request) {
  const auth = verifyBotAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const instanceFilter = url.searchParams.get("instance")?.trim() || null;
  const dryRun = url.searchParams.get("dry") === "true";

  const supabase = createServiceClient();

  let query = supabase
    .from("leads")
    .select("place_id, phone, evolution_instance")
    .eq("outreach_sent", true)
    .is("whatsapp_jid", null)
    .not("phone", "is", null)
    .not("evolution_instance", "is", null)
    .not("place_id", "like", "unknown_%")
    .order("outreach_sent_at", { ascending: false })
    .limit(limit);

  if (instanceFilter) {
    query = query.eq("evolution_instance", instanceFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[backfill:jid] query error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const leads = (data ?? []) as LeadRow[];
  const byInstance: Record<string, InstanceStat> = {};

  if (dryRun) {
    for (const lead of leads) {
      const key = lead.evolution_instance;
      if (!byInstance[key]) byInstance[key] = { processed: 0, updated: 0 };
      byInstance[key].processed++;
    }
    console.log(
      "[backfill:jid] dry-run — would process",
      leads.length,
      "leads; limit=",
      limit,
      "instanceFilter=",
      instanceFilter ?? "(all)",
    );
    return Response.json({
      ok: true,
      dry: true,
      would_process: leads.length,
      by_instance: byInstance,
    });
  }

  let processed = 0;
  let updated = 0;
  let skipped_invalid_phone = 0;
  let skipped_no_jid_found = 0;
  let errors = 0;

  console.log(
    "[backfill:jid] starting — candidates:",
    leads.length,
    "limit=",
    limit,
    "instanceFilter=",
    instanceFilter ?? "(all)",
  );

  for (const lead of leads) {
    processed++;
    const key = lead.evolution_instance;
    if (!byInstance[key]) byInstance[key] = { processed: 0, updated: 0 };
    byInstance[key].processed++;

    const normalized = normalizePhone(lead.phone);
    if (!isValidPhone(normalized)) {
      skipped_invalid_phone++;
      console.log(
        "[backfill:jid] skip invalid phone place_id=",
        lead.place_id,
        "phone=",
        lead.phone,
      );
      // no throttle — we didn't call Evolution
      continue;
    }

    try {
      const jid = await lookupJidFromPhone(normalized, lead.evolution_instance);

      if (!jid) {
        skipped_no_jid_found++;
        console.log(
          "[backfill:jid] no jid place_id=",
          lead.place_id,
          "phone=",
          normalized,
        );
      } else {
        // Race-safe: only write if whatsapp_jid is still NULL.
        const { data: updatedRows, error: updateError } = await supabase
          .from("leads")
          .update({ whatsapp_jid: jid })
          .eq("place_id", lead.place_id)
          .is("whatsapp_jid", null)
          .select("place_id");

        if (updateError) {
          errors++;
          console.error(
            "[backfill:jid] update error place_id=",
            lead.place_id,
            "error=",
            updateError.message,
          );
        } else if (!updatedRows || updatedRows.length === 0) {
          console.log(
            "[backfill:jid] race: jid already set place_id=",
            lead.place_id,
          );
        } else {
          updated++;
          byInstance[key].updated++;
          console.log(
            "[backfill:jid] updated place_id=",
            lead.place_id,
            "jid=",
            jid,
          );
        }
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        "[backfill:jid] exception place_id=",
        lead.place_id,
        "error=",
        msg,
      );
    }

    if (processed < leads.length) {
      await sleep(THROTTLE_MS);
    }
  }

  console.log(
    "[backfill:jid] complete — processed:",
    processed,
    "updated:",
    updated,
    "invalid_phone:",
    skipped_invalid_phone,
    "no_jid:",
    skipped_no_jid_found,
    "errors:",
    errors,
  );

  return Response.json({
    ok: true,
    processed,
    updated,
    skipped_invalid_phone,
    skipped_no_jid_found,
    errors,
    by_instance: byInstance,
  });
}
