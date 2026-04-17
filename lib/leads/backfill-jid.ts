import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupJidFromPhone } from "@/lib/whatsapp";

/**
 * Backfill `whatsapp_jid` on leads sent during a bot run.
 *
 * The prospect-bot writes leads directly to Supabase and calls Evolution to
 * send; it never touches `whatsapp_jid`. Evolution's webhook echo is racy
 * and frequently arrives with an `@lid` we can't resolve back to a phone.
 *
 * Fix: once a bot-sent lead is visible here (with phone + evolution_instance
 * populated), we look up the canonical JID via Evolution's
 * `/chat/whatsappNumbers/<instance>` endpoint and persist it. Subsequent
 * inbound replies then match by `whatsapp_jid` and are routed to the real
 * lead instead of creating `unknown_*` shadow rows.
 */
export async function backfillWhatsappJidsForRun(
  supabase: SupabaseClient,
  runStartedAt: string,
): Promise<{ checked: number; updated: number }> {
  const { data: pending, error } = await supabase
    .from("leads")
    .select("place_id, phone, evolution_instance")
    .eq("outreach_sent", true)
    .gte("outreach_sent_at", runStartedAt)
    .is("whatsapp_jid", null)
    .not("phone", "is", null)
    .not("evolution_instance", "is", null);

  if (error) {
    console.error("[bot:jid-backfill] query error:", error.message);
    return { checked: 0, updated: 0 };
  }

  if (!pending || pending.length === 0) {
    return { checked: 0, updated: 0 };
  }

  console.log(
    "[bot:jid-backfill] attempting lookup for",
    pending.length,
    "leads (runStart:",
    runStartedAt,
    ")",
  );

  let updated = 0;

  // Sequential to keep Evolution happy — batches are typically small (<50).
  for (const lead of pending) {
    const phone = lead.phone as string | null;
    const instance = lead.evolution_instance as string | null;
    const placeId = lead.place_id as string;

    if (!phone || !instance) continue;

    const jid = await lookupJidFromPhone(phone, instance);
    if (!jid) continue;

    const { error: updateErr } = await supabase
      .from("leads")
      .update({ whatsapp_jid: jid })
      .eq("place_id", placeId)
      .is("whatsapp_jid", null);

    if (updateErr) {
      console.error(
        "[bot:jid-backfill] update failed for",
        placeId,
        ":",
        updateErr.message,
      );
      continue;
    }

    console.log("[bot:jid-backfill] saved jid for", placeId, "→", jid);
    updated++;
  }

  console.log(
    "[bot:jid-backfill] complete — checked:",
    pending.length,
    "updated:",
    updated,
  );

  return { checked: pending.length, updated };
}
