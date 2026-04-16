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
import { logWebhook } from "./debug/route";
import type { Lead } from "@/lib/types";

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

    let lead:
      | {
          place_id: string;
          phone: string | null;
          status: string;
          evolution_instance: string | null;
        }
      | undefined;

    if (isLid) {
      const { data: jidLead } = await supabase
        .from("leads")
        .select("place_id, phone, status, evolution_instance")
        .eq("whatsapp_jid", remoteJid)
        .limit(1)
        .maybeSingle();

      if (jidLead) {
        lead = jidLead;
        console.log("[webhook] matched by whatsapp_jid:", lead.place_id);
      }
    }

    if (!lead && normalizedPhone) {
      const { data: leads } = await supabase
        .from("leads")
        .select("place_id, phone, status, evolution_instance")
        .not("phone", "is", null);

      lead = (leads ?? []).find((l) =>
        l.phone ? phoneMatch(normalizedPhone, l.phone) : false,
      );

      if (lead) {
        console.log("[webhook] matched by phone:", lead.place_id);
      }
    }

    if (
      !lead &&
      !isFromMe &&
      isLid &&
      !normalizedPhone &&
      webhookInstanceName
    ) {
      const { data: instanceLeads } = await supabase
        .from("leads")
        .select("place_id, phone, status, evolution_instance")
        .eq("evolution_instance", webhookInstanceName)
        .in("status", ["sent", "replied", "negotiating"])
        .not("phone", "is", null)
        .limit(2);

      if (instanceLeads && instanceLeads.length === 1) {
        lead = instanceLeads[0];
        console.log(
          "[webhook] matched by instance (temporary fallback):",
          lead.place_id,
        );
      } else if (instanceLeads && instanceLeads.length > 1) {
        console.log(
          "[webhook] ambiguous LID — multiple active leads on instance",
          webhookInstanceName,
          ":",
          instanceLeads.map((l) => l.place_id).join(", "),
          "— creating unknown lead instead",
        );
      }
    }

    const timestamp = data.messageTimestamp;
    const sentAt = timestamp
      ? new Date(Number(timestamp) * 1000).toISOString()
      : new Date().toISOString();

    let placeId: string;
    let leadStatus: string | null = null;

    if (lead) {
      placeId = lead.place_id;
      leadStatus = lead.status;

      const leadUpdates: Record<string, string> = {};

      if (
        isLid &&
        isValidPhone(normalizedPhone) &&
        normalizedPhone !== lead.phone
      ) {
        leadUpdates.phone = normalizedPhone;
      }
      if (isLid && remoteJid) {
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
        whatsapp_jid: isLid ? remoteJid : null,
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

      await supabase
        .from("leads")
        .update({
          last_outbound_at: sentAt,
        })
        .eq("place_id", placeId);

      return Response.json({ ok: true });
    }

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

    const autoReplyByContent = isAutoReply(text);
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
        })
        .eq("place_id", placeId);

      const dismissAutoReplySuggestions = async () => {
        await supabase
          .from("ai_suggestions")
          .update({ status: "rejected" })
          .eq("place_id", placeId)
          .eq("status", "pending");
      };

      await dismissAutoReplySuggestions();
      setTimeout(() => {
        dismissAutoReplySuggestions().catch(console.error);
      }, 5_000);
      setTimeout(() => {
        dismissAutoReplySuggestions().catch(console.error);
      }, 15_000);

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

    const leadUpdate: Record<string, unknown> = {
      last_inbound_at: sentAt,
      last_human_reply_at: sentAt,
      follow_up_paused: true,
    };

    if (leadStatus === "sent") {
      leadUpdate.status = "replied";
      leadUpdate.status_updated_at = new Date().toISOString();
    }

    await supabase.from("leads").update(leadUpdate).eq("place_id", placeId);

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
