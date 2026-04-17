import type { SupabaseClient } from "@supabase/supabase-js";
import { dismissPendingSuggestions } from "@/lib/ai-suggestions/dismiss";
import { pickCanonicalJid } from "@/lib/whatsapp";

export interface RecordOutboundOptions {
  supabase: SupabaseClient;
  place_id: string;
  channel: "whatsapp" | "email";
  message: string;
  subject?: string | null;
  whatsapp_jid?: string | null;
  evolution_instance?: string | null;
  suggested_by_ai?: boolean;
  is_follow_up?: boolean;
  /** When approving a suggestion, exclude it from bulk rejection. */
  excludeSuggestionId?: string;
  /** Defaults to `new Date().toISOString()`. */
  sent_at?: string;
  /**
   * Provider-supplied message id (Evolution's `key.id`). When set, it's the
   * primary idempotency key and gets persisted on the row; retries with the
   * same id short-circuit without side effects and are caught by the
   * `conversations_provider_message_id_unique` UNIQUE index on race.
   */
  provider_message_id?: string | null;
}

export type RecordOutboundResult =
  | {
      ok: true;
      conversation_id: string;
      /** Full inserted (or matched) conversation row. */
      conversation: Record<string, unknown>;
      /** True when the call matched an existing row and skipped side effects. */
      idempotent: boolean;
    }
  | { ok: false; error: string };

/** ±60s window used as the fallback dedup when no provider_message_id is given. */
const TEMPORAL_DEDUP_WINDOW_MS = 60_000;

/**
 * Persist the outcome of a successful outbound message. This is the single
 * write-path for the post-send invariants shared by `dispatchMessage` and the
 * bot→CRM outreach endpoints:
 *
 *   - exactly one conversations row (direction="out") per logical send
 *   - last_outbound_at = sent_at, outreach_error = null
 *   - pending AI suggestions dismissed (respecting excludeSuggestionId)
 *   - status transitions: prospected → sent, replied → negotiating
 *   - whatsapp_jid resolved via `pickCanonicalJid` — fills NULL and upgrades
 *     an existing `@lid` to `@s.whatsapp.net`, but never downgrades
 *     canonical phone-JIDs
 *   - evolution_instance updated only when provided
 *   - follow-up +24h scheduled unless `is_follow_up` or `follow_up_paused`
 *
 * Idempotency (owned here, not by callers):
 *   - If `provider_message_id` is given, a prior row with the same id is an
 *     exact duplicate — return it with `idempotent: true` and skip side
 *     effects. A concurrent race is caught on INSERT via UNIQUE violation
 *     (23505) and resolved the same way.
 *   - If not given (legacy callers), fall back to a ±60s window on
 *     (place_id, direction='out', message) to match the pre-PR2 behavior.
 *
 * Does NOT send messages — the caller is responsible for the actual send.
 * Returns `lead_not_found` without side effects when the lead doesn't exist,
 * so bot endpoints can map that to a 404.
 */
export async function recordOutboundMessage(
  opts: RecordOutboundOptions,
): Promise<RecordOutboundResult> {
  const {
    supabase,
    place_id,
    channel,
    message,
    subject,
    whatsapp_jid,
    evolution_instance,
    suggested_by_ai,
    is_follow_up,
    excludeSuggestionId,
    provider_message_id,
  } = opts;
  const sentAt = opts.sent_at ?? new Date().toISOString();

  const { data: leadCheck } = await supabase
    .from("leads")
    .select("status, follow_up_paused, whatsapp_jid")
    .eq("place_id", place_id)
    .maybeSingle();

  if (!leadCheck) {
    return { ok: false, error: "lead_not_found" };
  }

  // ── Idempotency pre-check ─────────────────────────────────────────────
  // Prefer provider_message_id (UNIQUE index) — exact, race-free against a
  // parallel write from the webhook echo. Fall back to the ±60s window for
  // callers that don't pass it (dispatch today, legacy bot retries).
  if (provider_message_id) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("*")
      .eq("provider_message_id", provider_message_id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log(
        "[record-outbound] idempotent via provider_message_id=",
        provider_message_id,
        "place_id=",
        place_id,
      );
      return {
        ok: true,
        conversation_id: existing.id as string,
        conversation: existing as Record<string, unknown>,
        idempotent: true,
      };
    }
  } else {
    const sentAtMs = new Date(sentAt).getTime();
    const lowerBound = new Date(
      sentAtMs - TEMPORAL_DEDUP_WINDOW_MS,
    ).toISOString();
    const upperBound = new Date(
      sentAtMs + TEMPORAL_DEDUP_WINDOW_MS,
    ).toISOString();

    const { data: existing } = await supabase
      .from("conversations")
      .select("*")
      .eq("place_id", place_id)
      .eq("direction", "out")
      .eq("message", message)
      .gte("sent_at", lowerBound)
      .lte("sent_at", upperBound)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log(
        "[record-outbound] idempotent via temporal window place_id=",
        place_id,
      );
      return {
        ok: true,
        conversation_id: existing.id as string,
        conversation: existing as Record<string, unknown>,
        idempotent: true,
      };
    }
  }

  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .insert({
      place_id,
      direction: "out",
      channel,
      message,
      subject: channel === "email" ? (subject || null) : null,
      sent_at: sentAt,
      suggested_by_ai: suggested_by_ai ?? false,
      provider_message_id: provider_message_id ?? null,
    })
    .select()
    .single();

  if (convError || !conv) {
    // UNIQUE violation on provider_message_id — the webhook (or a parallel
    // retry) beat us. Fetch the winner and return it as idempotent instead
    // of surfacing a DB error.
    if (convError?.code === "23505" && provider_message_id) {
      const { data: winner } = await supabase
        .from("conversations")
        .select("*")
        .eq("provider_message_id", provider_message_id)
        .limit(1)
        .maybeSingle();

      if (winner) {
        console.log(
          "[record-outbound] unique-violation provider_message_id=",
          provider_message_id,
          "place_id=",
          place_id,
        );
        return {
          ok: true,
          conversation_id: winner.id as string,
          conversation: winner as Record<string, unknown>,
          idempotent: true,
        };
      }
    }

    return {
      ok: false,
      error: convError?.message ?? "conversation_insert_failed",
    };
  }

  await dismissPendingSuggestions(supabase, place_id, excludeSuggestionId);

  const desiredJid = pickCanonicalJid(
    leadCheck.whatsapp_jid ?? null,
    whatsapp_jid ?? null,
  );
  const jidUpdate =
    desiredJid && desiredJid !== (leadCheck.whatsapp_jid ?? null)
      ? { whatsapp_jid: desiredJid }
      : {};

  const instanceUpdate = evolution_instance ? { evolution_instance } : {};

  const scheduleFollowUp =
    !is_follow_up && !leadCheck.follow_up_paused
      ? {
          follow_up_count: 0,
          next_follow_up_at: new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString(),
        }
      : {};

  const baseOutboundPatch = {
    last_outbound_at: sentAt,
    outreach_error: null,
    ...jidUpdate,
    ...instanceUpdate,
    ...scheduleFollowUp,
  };

  if (leadCheck.status === "prospected") {
    await supabase
      .from("leads")
      .update({
        status: "sent",
        outreach_sent: true,
        outreach_sent_at: sentAt,
        outreach_channel: channel,
        status_updated_at: sentAt,
        ...baseOutboundPatch,
      })
      .eq("place_id", place_id);
  } else if (leadCheck.status === "replied") {
    await supabase
      .from("leads")
      .update({
        status: "negotiating",
        status_updated_at: sentAt,
        ...baseOutboundPatch,
      })
      .eq("place_id", place_id);
  } else {
    await supabase
      .from("leads")
      .update(baseOutboundPatch)
      .eq("place_id", place_id);
  }

  return {
    ok: true,
    conversation_id: conv.id as string,
    conversation: conv as Record<string, unknown>,
    idempotent: false,
  };
}
