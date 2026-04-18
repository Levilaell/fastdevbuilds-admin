import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendWhatsApp,
  getOrAssignInstance,
  lookupJidFromPhone,
} from "@/lib/whatsapp";
import { resolvePhoneForLead } from "@/lib/messages/resolve-phone";
import { sendEmail } from "@/lib/messages/send-email";
import { recordOutboundMessage } from "@/lib/messages/record-outbound";

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
  let sendProviderMessageId: string | undefined;
  const dispatchContext: { phone: string | null; instance: string | null } = {
    phone: null,
    instance: null,
  };

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

    // Capture phone+instance so we can backfill the JID after send even if
    // the Evolution response didn't include a remoteJid we could parse.
    dispatchContext.phone = resolved.phone;
    dispatchContext.instance = instance?.name ?? null;

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
    sendProviderMessageId = result.providerMessageId;
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

  // ── 2. JID fallback (WhatsApp only) ───────────────────────────────────
  // The Evolution send response doesn't always include a parseable remoteJid,
  // so we fall back to `/chat/whatsappNumbers/{instance}` which takes phone
  // and returns the canonical JID (handles LID-migrated contacts too). This
  // needs the phone+instance actually used for sending, which only dispatch
  // knows — record-outbound takes the resolved JID as input.
  let jidToPersist: string | null = sendRemoteJid ?? null;
  if (
    channel === "whatsapp" &&
    !jidToPersist &&
    !lead.whatsapp_jid &&
    dispatchContext.phone
  ) {
    jidToPersist = await lookupJidFromPhone(
      dispatchContext.phone,
      dispatchContext.instance ?? undefined,
    );
    console.log(
      "[dispatch:jid] fallback lookup for",
      place_id,
      "→",
      jidToPersist ?? "(null)",
    );
  }

  if (channel === "whatsapp" && jidToPersist && !lead.whatsapp_jid) {
    console.log("[dispatch:jid] persisting", jidToPersist, "for", place_id);
  } else if (channel === "whatsapp" && !jidToPersist && !lead.whatsapp_jid) {
    console.warn("[dispatch:jid] could not resolve jid for", place_id);
  }

  // ── 3. Record outbound (shared with bot→CRM outreach endpoints) ───────
  const recorded = await recordOutboundMessage({
    supabase,
    place_id,
    channel,
    message,
    subject,
    whatsapp_jid: jidToPersist,
    provider_message_id: sendProviderMessageId ?? null,
    suggested_by_ai: suggestedByAi,
    is_follow_up: opts.isFollowUp,
    excludeSuggestionId,
    sent_at: now,
  });

  if (!recorded.ok) {
    return { ok: false, error: recorded.error, httpStatus: 500 };
  }

  return { ok: true, conversation: recorded.conversation };
}
