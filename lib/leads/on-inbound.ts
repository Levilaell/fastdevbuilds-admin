import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Update lead state when a real (non-auto-reply) inbound message arrives.
 * Works for both WhatsApp and email channels.
 *
 * Updates:
 *   - last_inbound_at
 *   - last_human_reply_at
 *   - follow_up_paused = true
 *   - status: sent → replied (with status_updated_at)
 *
 * Does NOT insert conversations — caller handles that separately.
 */
export async function onInboundLeadMessage(
  supabase: SupabaseClient,
  placeId: string,
  sentAt: string,
  currentStatus: string | null,
): Promise<void> {
  const update: Record<string, unknown> = {
    last_inbound_at: sentAt,
    last_human_reply_at: sentAt,
    follow_up_paused: true,
  };

  if (currentStatus === "sent") {
    update.status = "replied";
    update.status_updated_at = new Date().toISOString();
  }

  await supabase.from("leads").update(update).eq("place_id", placeId);
}
