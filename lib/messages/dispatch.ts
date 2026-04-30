import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendWhatsApp,
  getOrAssignInstance,
  lookupJidFromPhone,
} from "@/lib/whatsapp";
import { resolvePhoneForLead } from "@/lib/messages/resolve-phone";
import { recordOutboundMessage } from "@/lib/messages/record-outbound";

export interface DispatchOptions {
  supabase: SupabaseClient;
  place_id: string;
  message: string;
  subject?: string;
  suggestedByAi?: boolean;
  lead: {
    phone: string | null;
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
 * and lead status transitions.
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
    subject,
    suggestedByAi,
    lead,
  } = opts;
  const now = new Date().toISOString();

  // ── 1. Send ────────────────────────────────────────────────────────────

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

  const sendRemoteJid = result.remoteJid;
  const sendProviderMessageId = result.providerMessageId;

  // ── 2. JID fallback ───────────────────────────────────────────────────
  // The Evolution send response doesn't always include a parseable remoteJid,
  // so we fall back to `/chat/whatsappNumbers/{instance}` which takes phone
  // and returns the canonical JID. record-outbound takes the resolved JID
  // as input.
  let jidToPersist: string | null = sendRemoteJid ?? null;
  if (!jidToPersist && !lead.whatsapp_jid) {
    jidToPersist = await lookupJidFromPhone(resolved.phone, instance?.name);
    console.log(
      "[dispatch:jid] fallback lookup for",
      place_id,
      "→",
      jidToPersist ?? "(null)",
    );
  }

  // ── 3. Record outbound ────────────────────────────────────────────────
  const recorded = await recordOutboundMessage({
    supabase,
    place_id,
    channel: "whatsapp",
    message,
    subject,
    whatsapp_jid: jidToPersist,
    provider_message_id: sendProviderMessageId ?? null,
    suggested_by_ai: suggestedByAi,
    sent_at: now,
  });

  if (!recorded.ok) {
    return { ok: false, error: recorded.error, httpStatus: 500 };
  }

  return { ok: true, conversation: recorded.conversation };
}
