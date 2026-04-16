import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reject all pending AI suggestions for a lead.
 * Optionally exclude a specific suggestion ID (e.g. one being approved).
 */
export async function dismissPendingSuggestions(
  supabase: SupabaseClient,
  placeId: string,
  excludeId?: string,
): Promise<void> {
  let query = supabase
    .from("ai_suggestions")
    .update({ status: "rejected" })
    .eq("place_id", placeId)
    .eq("status", "pending");

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  await query;
}
