import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsApp, getOrAssignInstance } from "@/lib/whatsapp";
import { resolvePhoneForLead } from "@/lib/messages/resolve-phone";
import { sendEmail } from "@/lib/messages/send-email";
import { dismissPendingSuggestions } from "@/lib/ai-suggestions/dismiss";

export interface DispatchOptions {
  supabase: SupabaseClient;
  place_id: string;
  message: string;
  channel: "whatsapp" | "email";
  subject?: string;
  suggestedByAi?: boolean;
  /** When approving a suggestion, exclude it from bulk rejection */
  excludeSuggestionId?: string;
  /** Skip follow-up scheduling (used by the follow-up worker itself) */
  isFollowUp?: boolean;
  lead: {
    phone: string | null;
    email: string | null;
    evolution_instance: string | null;
    whatsapp_jid: string | null;
  };
}

export type DispatchResult =
  | { ok: true; conversation: Record<string, unknown> }
  | { ok: false; error: string; httpStatus: number; detail?: unknown };

/**
 * Single outbound message path for both WhatsApp and email.
 *
 * Handles: recipient resolution, sending, conversation insert,
 * suggestion dismissal, and lead status transitions.
 *
 * Invariants enforced here:
 *   - Every successful send results in exactly one "out" conversation row.
 *   - Every successful send sets last_outbound_at and clears outreach_error.
 *   - Status transitions: prospected → sent, replied → negotiating.
 *   - whatsapp_jid is persisted from Evolution's send response when we don't
 *     already have one, so later inbound webhooks can match by JID.
 */
export async function dispatchMessage(
  opts: DispatchOptions,
): Promise<DispatchResult> {
  const {
    supabase,
    place_id,
    message,
    channel,
    subject,
    suggestedByAi,
    excludeSuggestionId,
    lead,
  } = opts;
  const now = new Date().toISOString();

  // ── 1. Send ────────────────────────────────────────────────────────────

  let sendRemoteJid: string | undefined;

  if (channel === "whatsapp") {
    const resolved = await resolvePhoneForLead({
      place_id,
      phone: lead.phone,
      whatsapp_jid: lead.whatsapp_jid,
      evolution_instance: lead.evolution_instance,
    });

    if (!resolved) {
      return {
        ok: false,
        error: "Lead não tem telefone cadastrado",
        httpStatus: 400,
      };
    }

    if (resolved.shouldBackfill) {
      await supabase
        .from("leads")
        .update({ phone: resolved.phone })
        .eq("place_id", place_id);
    }

    const instance = await getOrAssignInstance(supabase, place_id);
    const result = await sendWhatsApp(resolved.phone, message, instance?.name);

    if (!result.ok) {
      console.error("[dispatch] whatsapp failed:", result);

      // Invalid WhatsApp number — disqualify immediately, never retry
      if (result.reason === "number_not_on_whatsapp") {
        await supabase
          .from("leads")
          .update({
            status: "disqualified" as const,
            outreach_error: "invalid_whatsapp_number",
            status_updated_at: now,
            next_follow_up_at: null,
          })
          .eq("place_id", place_id);

        return {
          ok: false,
          error: "Número não existe no WhatsApp",
          httpStatus: 400,
        };
      }

      await supabase
        .from("leads")
        .update({
          outreach_error: JSON.stringify(result).slice(0, 1000),
          status_updated_at: now,
        })
        .eq("place_id", place_id);

      return {
        ok: false,
        error: "Falha ao enviar WhatsApp",
        httpStatus: 502,
        detail: result,
      };
    }

    sendRemoteJid = result.remoteJid;
  } else {
    const email = lead.email?.trim();
    if (!email) {
      return {
        ok: false,
        error: "Lead não tem email cadastrado",
        httpStatus: 400,
      };
    }

    const result = await sendEmail({ email, message, subject });

    if (!result.ok) {
      console.error("[dispatch] email failed:", result);

      const errorDetail =
        result.reason === "not_configured"
          ? "Instantly not configured (missing API key or campaign ID)"
          : (result.body ?? result.reason);

      await supabase
        .from("leads")
        .update({
          outreach_error: errorDetail.slice(0, 1000),
          status_updated_at: now,
        })
        .eq("place_id", place_id);

      return {
        ok: false,
        error: errorDetail,
        httpStatus: result.reason === "not_configured" ? 501 : 502,
      };
    }
  }

  // ── 2. Save conversation ──────────────────────────────────────────────

  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .insert({
      place_id,
      direction: "out",
      channel,
      message,
      subject: channel === "email" ? (subject || null) : null,
      sent_at: now,
      suggested_by_ai: suggestedByAi ?? false,
    })
    .select()
    .single();

  if (convError) {
    return { ok: false, error: convError.message, httpStatus: 500 };
  }

  // ── 3. Dismiss pending AI suggestions ─────────────────────────────────

  await dismissPendingSuggestions(supabase, place_id, excludeSuggestionId);

  // ── 4. Lead state update: status, outbound tracking, JID backfill ─────

  const { data: leadCheck } = await supabase
    .from("leads")
    .select("status, follow_up_paused, whatsapp_jid")
    .eq("place_id", place_id)
    .maybeSingle();

  // Schedule follow-up when this is a human-initiated send and lead hasn't paused
  const scheduleFollowUp =
    !opts.isFollowUp && !leadCheck?.follow_up_paused
      ? {
          follow_up_count: 0,
          next_follow_up_at: new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString(),
        }
      : {};

  // Persist remoteJid returned by Evolution so future inbound webhooks can
  // match by whatsapp_jid (needed when Evolution sends @lid JIDs whose
  // profile-pic resolution fails).
  const jidUpdate =
    sendRemoteJid && !leadCheck?.whatsapp_jid
      ? { whatsapp_jid: sendRemoteJid }
      : {};

  // Every successful outbound touches these invariants — extracted so each
  // branch below stays DRY and we can't forget a field.
  const baseOutboundPatch = {
    last_outbound_at: now,
    outreach_error: null,
    ...jidUpdate,
    ...scheduleFollowUp,
  };

  if (leadCheck?.status === "prospected") {
    await supabase
      .from("leads")
      .update({
        status: "sent",
        outreach_sent: true,
        outreach_sent_at: now,
        outreach_channel: channel,
        status_updated_at: now,
        ...baseOutboundPatch,
      })
      .eq("place_id", place_id);
  } else if (leadCheck?.status === "replied") {
    await supabase
      .from("leads")
      .update({
        status: "negotiating",
        status_updated_at: now,
        ...baseOutboundPatch,
      })
      .eq("place_id", place_id);
  } else {
    await supabase
      .from("leads")
      .update(baseOutboundPatch)
      .eq("place_id", place_id);
  }

  return { ok: true, conversation: conv };
}
