import { createClient } from "@supabase/supabase-js";
import { getRecentConversations } from "@/lib/supabase/queries";
import { classifyAndSuggest } from "@/lib/ai-workflow";
import { isAutoReply, isInstantReply } from "@/lib/auto-reply";
import {
  normalizePhone,
  phoneMatch,
  getInstances,
  getInstanceByKey,
  isValidPhone,
  resolvePhoneFromLid,
} from "@/lib/whatsapp";
import { dismissPendingSuggestions } from "@/lib/ai-suggestions/dismiss";
import { onInboundLeadMessage } from "@/lib/leads/on-inbound";
import { logWebhook } from "./debug/route";
import type { Lead } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Window (ms) used to attribute ambiguous LID inbounds to recent outbound
 * sends on the same instance. Kept conservative to avoid cross-lead bleed.
 */
const INSTANCE_ATTRIBUTION_WINDOW_MS = 2 * 60 * 60 * 1000;

type MatchedLead = {
  place_id: string;
  phone: string | null;
  status: string;
  evolution_instance: string | null;
  whatsapp_jid: string | null;
};

const LEAD_SELECT =
  "place_id, phone, status, evolution_instance, whatsapp_jid";

/**
 * Match a webhook event against a stored lead using, in order:
 *   1. whatsapp_jid exact match (works for LID and s.whatsapp.net)
 *   2. phone match (after normalization)
 *   3. outbound echo: same instance + identical outreach message text
 *      (handles bot-sent leads whose @lid echo arrives before any
 *      whatsapp_jid has been persisted).
 *   4. inbound fast-reply race: same instance + most recent outbound in
 *      the attribution window + no inbound yet + no JID yet. Only fires
 *      when it's unambiguous (exactly one candidate).
 *
 * Returns the matched lead or null. The caller decides whether to fall
 * back to creating an unknown_* shadow lead.
 */
async function matchLead(params: {
  supabase: SupabaseClient;
  remoteJid: string;
  normalizedPhone: string;
  isFromMe: boolean;
  text: string;
  webhookInstanceName: string;
}): Promise<MatchedLead | null> {
  const {
    supabase,
    remoteJid,
    normalizedPhone,
    isFromMe,
    text,
    webhookInstanceName,
  } = params;

  // 1. whatsapp_jid exact
  if (remoteJid) {
    const { data: jidLead } = await supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("whatsapp_jid", remoteJid)
      .limit(1)
      .maybeSingle();

    if (jidLead) {
      console.log("[webhook] matched by whatsapp_jid:", jidLead.place_id);
      return jidLead as MatchedLead;
    }
  }

  // 2. phone match
  if (normalizedPhone) {
    const { data: leads } = await supabase
      .from("leads")
      .select(LEAD_SELECT)
      .not("phone", "is", null);

    const phoneHit = (leads ?? []).find((l) =>
      l.phone ? phoneMatch(normalizedPhone, l.phone) : false,
    );

    if (phoneHit) {
      console.log("[webhook] matched by phone:", phoneHit.place_id);
      return phoneHit as MatchedLead;
    }
  }

  if (!webhookInstanceName) return null;

  // 3. outbound echo by message text (bot-sent leads)
  // Intentionally NOT gated by `outreach_sent=true`: the bot may save the
  // message row before flipping outreach_sent, creating a narrow race where
  // Evolution's echo arrives first and would otherwise miss.
  if (isFromMe && text) {
    const { data: textHit } = await supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("evolution_instance", webhookInstanceName)
      .eq("message", text)
      .is("whatsapp_jid", null)
      .order("outreach_sent_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (textHit) {
      console.log(
        "[webhook:match] matched outbound echo by message text:",
        textHit.place_id,
      );
      return textHit as MatchedLead;
    }
    console.log(
      "[webhook:match] text-echo miss on instance",
      webhookInstanceName,
      "— text preview:",
      text.slice(0, 60),
    );
  }

  // 4. inbound fast-reply race: instance + most-recent outbound without inbound
  if (!isFromMe) {
    const since = new Date(
      Date.now() - INSTANCE_ATTRIBUTION_WINDOW_MS,
    ).toISOString();
    const { data: candidates } = await supabase
      .from("leads")
      .select(
        "place_id, phone, status, evolution_instance, whatsapp_jid, outreach_sent_at",
      )
      .eq("evolution_instance", webhookInstanceName)
      .eq("outreach_sent", true)
      .gte("outreach_sent_at", since)
      .is("last_inbound_at", null)
      .is("whatsapp_jid", null)
      .order("outreach_sent_at", { ascending: false })
      .limit(2);

    if (candidates && candidates.length === 1) {
      console.log(
        "[webhook] matched by instance attribution:",
        candidates[0].place_id,
      );
      return candidates[0] as MatchedLead;
    }
    if (candidates && candidates.length > 1) {
      console.log(
        "[webhook] ambiguous instance attribution on",
        webhookInstanceName,
        "—",
        candidates.map((c) => c.place_id).join(", "),
      );
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const headerKey =
      request.headers.get("apikey") ?? request.headers.get("x-api-key");
    const bodyKey = typeof body.apikey === "string" ? body.apikey : undefined;
    const webhookKey = headerKey ?? bodyKey;
    const globalKey = process.env.EVOLUTION_API_KEY;
    const matchedInstance = webhookKey
      ? getInstanceByKey(webhookKey)
      : undefined;
    const isGlobalKey =
      !matchedInstance && !!globalKey && webhookKey === globalKey;

    if (webhookKey && !matchedInstance && !isGlobalKey) {
      console.log(
        "[webhook] unrecognized key:",
        webhookKey.slice(0, 8) + "... — accepting anyway",
      );
    }

    const rawInstance = body.instance;
    const bodyInstance: string =
      (typeof rawInstance === "string" ? rawInstance : "") ||
      (rawInstance != null && typeof rawInstance === "object"
        ? rawInstance.instanceName
        : "") ||
      body.instanceName ||
      body.sender ||
      body.data?.instance?.instanceName ||
      "";

    const instances = getInstances();
    const resolvedInstance =
      matchedInstance ?? instances.find((i) => i.name === bodyInstance) ?? null;

    if (!resolvedInstance && instances.length > 0) {
      console.warn(
        "[webhook] could not identify instance from key or body — bodyInstance:",
        bodyInstance,
        "available:",
        instances.map((i) => i.name).join(","),
      );
    }

    const webhookInstanceName = resolvedInstance?.name ?? "";
    const webhookInstanceKey = resolvedInstance?.apiKey ?? "";

    logWebhook(body);

    console.log(
      "[webhook] event:",
      body.event,
      "bodyInstance:",
      bodyInstance,
      "resolvedTo:",
      webhookInstanceName,
      "isGlobalKey:",
      isGlobalKey,
      "topKeys:",
      Object.keys(body).join(","),
      "fromMe:",
      body.data?.key?.fromMe,
      "remoteJid:",
      body.data?.key?.remoteJid,
      "hasMessage:",
      !!body.data?.message,
      "keys:",
      body.data?.message ? Object.keys(body.data.message).join(",") : "none",
    );

    const rawEvent = (body.event as string) ?? "";
    const event = rawEvent.toLowerCase().replace(/_/g, ".");
    const MESSAGE_EVENTS = [
      "messages.upsert",
      "send.message",
      "messages.update",
    ];

    if (!MESSAGE_EVENTS.includes(event)) {
      return Response.json({ ok: true });
    }

    const data = body.data;
    if (!data?.key) {
      console.log("[webhook] no key in data, skipping");
      return Response.json({ ok: true });
    }

    if (event === "messages.update" && data.update?.status !== undefined) {
      return Response.json({ ok: true });
    }

    const isFromMe = event === "send.message" || !!data.key.fromMe;
    const remoteJid: string = data.key.remoteJid ?? "";

    if (remoteJid.endsWith("@g.us")) {
      return Response.json({ ok: true });
    }

    const jidValue = remoteJid.split("@")[0];
    const isLid = remoteJid.endsWith("@lid");

    if (!jidValue) {
      return Response.json({ ok: true });
    }

    let phone: string;
    if (isLid) {
      console.log(
        "[webhook] LID detected:",
        jidValue,
        "— resolving via",
        webhookInstanceName,
      );
      const resolved = await resolvePhoneFromLid(
        jidValue,
        webhookInstanceName,
        webhookInstanceKey,
      );
      phone = resolved || "";
      if (!resolved) {
        console.log("[webhook] could not resolve LID, phone will be empty");
      }
    } else {
      phone = jidValue;
    }

    const msg = data.message ?? {};
    const text: string =
      msg.conversation ??
      msg.extendedTextMessage?.text ??
      msg.imageMessage?.caption ??
      msg.videoMessage?.caption ??
      msg.documentMessage?.caption ??
      msg.buttonsResponseMessage?.selectedDisplayText ??
      msg.listResponseMessage?.title ??
      msg.templateButtonReplyMessage?.selectedDisplayText ??
      "";

    if (!text) {
      if (isFromMe) {
        console.log(
          "[webhook] outbound message with no text, message keys:",
          Object.keys(msg).join(","),
        );
      }
      return Response.json({ ok: true });
    }

    const normalizedPhone = phone ? normalizePhone(phone) : "";
    const preview = text.length > 60 ? text.slice(0, 60) + "…" : text;
    console.log(
      `[webhook] ${isFromMe ? "OUT" : "IN"} phone:`,
      normalizedPhone || "(unresolved LID)",
      preview,
    );

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );

    const lead = await matchLead({
      supabase,
      remoteJid,
      normalizedPhone,
      isFromMe,
      text,
      webhookInstanceName,
    });

    const timestamp = data.messageTimestamp;
    const sentAt = timestamp
      ? new Date(Number(timestamp) * 1000).toISOString()
      : new Date().toISOString();

    let placeId: string;
    let leadStatus: string | null = null;

    if (lead) {
      placeId = lead.place_id;
      leadStatus = lead.status;

      // Backfill missing identifiers on the matched lead so future events
      // match faster and more reliably. Never overwrite existing values.
      const leadUpdates: Record<string, string> = {};

      if (
        isValidPhone(normalizedPhone) &&
        (!lead.phone || normalizePhone(lead.phone) !== normalizedPhone)
      ) {
        leadUpdates.phone = normalizedPhone;
      }
      if (remoteJid && !lead.whatsapp_jid) {
        leadUpdates.whatsapp_jid = remoteJid;
      }
      if (!lead.evolution_instance && webhookInstanceName) {
        leadUpdates.evolution_instance = webhookInstanceName;
      }

      if (Object.keys(leadUpdates).length > 0) {
        await supabase
          .from("leads")
          .update(leadUpdates)
          .eq("place_id", placeId);
      }
    } else if (isFromMe) {
      // Outbound echo we couldn't attribute to any lead. Only keep the
      // conversation if a shadow unknown_ lead already exists for this JID;
      // otherwise drop it — creating a bare unknown_ from our own outbound
      // would only generate noise.
      const lidPlaceId = `unknown_${jidValue}`;
      const { data: lidLead } = await supabase
        .from("leads")
        .select("place_id, status")
        .eq("place_id", lidPlaceId)
        .maybeSingle();

      if (lidLead) {
        placeId = lidLead.place_id;
        leadStatus = lidLead.status;
      } else {
        return Response.json({ ok: true });
      }
    } else {
      // Genuine unknown inbound — create the shadow lead.
      const pushName: string = data.pushName ?? "";
      placeId =
        normalizedPhone && isValidPhone(normalizedPhone)
          ? `unknown_${normalizedPhone}`
          : `unknown_${jidValue}`;

      const upsertData: Record<string, unknown> = {
        place_id: placeId,
        business_name: pushName || normalizedPhone || jidValue,
        outreach_channel: "whatsapp",
        evolution_instance: webhookInstanceName,
        whatsapp_jid: remoteJid || null,
        status: "replied",
        niche: "inbound",
        status_updated_at: new Date().toISOString(),
        last_inbound_at: sentAt,
        last_human_reply_at: sentAt,
        follow_up_paused: true,
      };

      if (isValidPhone(normalizedPhone)) {
        upsertData.phone = normalizedPhone;
      }

      await supabase
        .from("leads")
        .upsert(upsertData, { onConflict: "place_id" });
    }

    // ── Outbound echo path ────────────────────────────────────────────────
    if (isFromMe) {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("place_id", placeId)
        .eq("direction", "out")
        .eq("message", text)
        .gte("sent_at", new Date(Date.now() - 120_000).toISOString())
        .limit(1);

      if (existing && existing.length > 0) {
        return Response.json({ ok: true });
      }

      await supabase.from("conversations").insert({
        place_id: placeId,
        direction: "out",
        channel: "whatsapp",
        message: text,
        sent_at: sentAt,
        suggested_by_ai: false,
      });

      // Mirror dispatch.ts transitions when an outbound originates outside
      // the dashboard (e.g. sales rep replies from their phone directly):
      //   prospected → sent    (bot-sent leads that skipped dispatch)
      //   replied    → negotiating
      const outboundPatch: Record<string, unknown> = {
        last_outbound_at: sentAt,
        outreach_error: null,
      };

      if (leadStatus === "prospected") {
        outboundPatch.status = "sent";
        outboundPatch.outreach_sent = true;
        outboundPatch.outreach_sent_at = sentAt;
        outboundPatch.outreach_channel = "whatsapp";
        outboundPatch.status_updated_at = sentAt;
      } else if (leadStatus === "replied") {
        outboundPatch.status = "negotiating";
        outboundPatch.status_updated_at = sentAt;
      }

      await supabase
        .from("leads")
        .update(outboundPatch)
        .eq("place_id", placeId);

      return Response.json({ ok: true });
    }

    // ── Inbound path ─────────────────────────────────────────────────────
    const { data: inboundDup } = await supabase
      .from("conversations")
      .select("id")
      .eq("place_id", placeId)
      .eq("direction", "in")
      .eq("message", text)
      .gte(
        "sent_at",
        new Date(new Date(sentAt).getTime() - 5_000).toISOString(),
      )
      .lte(
        "sent_at",
        new Date(new Date(sentAt).getTime() + 5_000).toISOString(),
      )
      .limit(1);

    if (inboundDup && inboundDup.length > 0) {
      return Response.json({ ok: true });
    }

    const { data: lastOutbound } = await supabase
      .from("conversations")
      .select("sent_at")
      .eq("place_id", placeId)
      .eq("direction", "out")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const replyMs = timestamp
      ? Number(timestamp) * 1000
      : new Date(sentAt).getTime();
    const outboundMs = lastOutbound?.sent_at
      ? new Date(lastOutbound.sent_at).getTime()
      : null;
    const secondsSinceOutbound =
      outboundMs !== null && replyMs >= outboundMs
        ? (replyMs - outboundMs) / 1000
        : undefined;

    const autoReplyByContent = isAutoReply(text, { secondsSinceOutbound });
    const autoReplyBySpeed = isInstantReply(
      timestamp ? Number(timestamp) : sentAt,
      lastOutbound?.sent_at ?? null,
    );
    const isAutoReplyMessage = autoReplyByContent || autoReplyBySpeed;

    if (isAutoReplyMessage) {
      await supabase.from("conversations").insert({
        place_id: placeId,
        direction: "in",
        channel: "whatsapp",
        message: text,
        sent_at: sentAt,
        suggested_by_ai: false,
        approved_by: "auto-reply",
      });

      await supabase
        .from("leads")
        .update({
          last_inbound_at: sentAt,
          last_auto_reply_at: sentAt,
          follow_up_paused: true,
        })
        .eq("place_id", placeId);

      await dismissPendingSuggestions(supabase, placeId);

      return Response.json({ ok: true });
    }

    const { data: conv } = await supabase
      .from("conversations")
      .insert({
        place_id: placeId,
        direction: "in",
        channel: "whatsapp",
        message: text,
        sent_at: sentAt,
        suggested_by_ai: false,
      })
      .select("id")
      .single();

    await onInboundLeadMessage(supabase, placeId, sentAt, leadStatus);

    const fullLead = await supabase
      .from("leads")
      .select("*")
      .eq("place_id", placeId)
      .single();

    if (fullLead.data) {
      const history = await getRecentConversations(supabase, placeId, 5);
      classifyAndSuggest(fullLead.data as Lead, text, history, conv?.id).catch(
        console.error,
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[webhook] error:", err);
    return Response.json({ ok: true });
  }
}
