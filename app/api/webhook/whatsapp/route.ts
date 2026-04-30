import { createClient } from "@supabase/supabase-js";
import { isAutoReply, isInstantReply } from "@/lib/auto-reply";
import {
  normalizePhone,
  getInstances,
  getInstanceByKey,
  isValidPhone,
} from "@/lib/whatsapp";
import { onInboundLeadMessage } from "@/lib/leads/on-inbound";
import { matchLeadByPushName } from "@/lib/leads/pushname-match";
import { logWebhook } from "./debug/route";
import type { SupabaseClient } from "@supabase/supabase-js";

type MatchedLead = {
  place_id: string;
  phone: string | null;
  status: string;
  evolution_instance: string | null;
  whatsapp_jid: string | null;
};

const LEAD_SELECT =
  "place_id, phone, status, evolution_instance, whatsapp_jid";

type MatchMethod = "jid" | "phone" | "pushname-fuzzy" | "none";

interface MatchResult {
  lead: MatchedLead | null;
  method: MatchMethod;
}

/**
 * Coerce an Evolution `messageTimestamp` into a valid ISO string.
 * Handles unix seconds (number/string), ISO strings, protobuf Long objects.
 * Returns `{ iso, fallback }` where fallback=true means we couldn't parse.
 */
function parseEventTimestampToIso(raw: unknown): {
  iso: string;
  fallback: boolean;
} {
  const fallback = () => ({ iso: new Date().toISOString(), fallback: true });

  if (raw == null || raw === "") return fallback();

  if (typeof raw === "object") {
    const maybe = raw as { low?: unknown; high?: unknown; toNumber?: unknown };
    if (typeof maybe.toNumber === "function") {
      const n = (maybe.toNumber as () => number)();
      if (Number.isFinite(n)) {
        const d = new Date(n * 1000);
        if (!Number.isNaN(d.getTime())) return { iso: d.toISOString(), fallback: false };
      }
    }
    if (typeof maybe.low === "number" && typeof maybe.high === "number") {
      const n = maybe.high * 0x1_0000_0000 + (maybe.low >>> 0);
      if (Number.isFinite(n) && n > 0) {
        const d = new Date(n * 1000);
        if (!Number.isNaN(d.getTime())) return { iso: d.toISOString(), fallback: false };
      }
    }
    return fallback();
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return fallback();
    const d = new Date(raw * 1000);
    if (!Number.isNaN(d.getTime())) return { iso: d.toISOString(), fallback: false };
    return fallback();
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return fallback();

    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      if (Number.isFinite(n) && n > 0) {
        const d = new Date(n * 1000);
        if (!Number.isNaN(d.getTime())) return { iso: d.toISOString(), fallback: false };
      }
    }

    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return { iso: d.toISOString(), fallback: false };
  }

  return fallback();
}

/**
 * Match a webhook event against a stored lead. Three cascading strategies:
 *   1. whatsapp_jid exact match.
 *   2. phone match (after normalization).
 *   3. pushName fuzzy match (last resort, scoped to the receiving instance).
 */
async function matchLead(params: {
  supabase: SupabaseClient;
  remoteJid: string;
  normalizedPhone: string;
  pushName: string;
  webhookInstanceName: string;
}): Promise<MatchResult> {
  const { supabase, remoteJid, normalizedPhone, pushName, webhookInstanceName } = params;

  // 1. JID exact match
  if (remoteJid) {
    const { data: jidLead } = await supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("whatsapp_jid", remoteJid)
      .limit(1)
      .maybeSingle();

    if (jidLead) {
      return { lead: jidLead as MatchedLead, method: "jid" };
    }
  }

  // 2. phone match (normalized)
  if (isValidPhone(normalizedPhone)) {
    const { data: phoneLeads } = await supabase.from("leads").select(LEAD_SELECT);
    if (phoneLeads) {
      for (const candidate of phoneLeads) {
        if (candidate.phone && normalizePhone(candidate.phone) === normalizedPhone) {
          return { lead: candidate as MatchedLead, method: "phone" };
        }
      }
    }
  }

  // 3. pushName fuzzy match (scoped to instance, 14-day window)
  if (pushName && webhookInstanceName) {
    const fuzzyMatch = await matchLeadByPushName<{
      place_id: string;
      business_name: string | null;
    }>({
      supabase,
      pushName,
      instance: webhookInstanceName,
      leadColumns: "place_id, business_name",
    });
    if (fuzzyMatch) {
      const { data: lead } = await supabase
        .from("leads")
        .select(LEAD_SELECT)
        .eq("place_id", fuzzyMatch.place_id)
        .maybeSingle();
      if (lead) {
        return { lead: lead as MatchedLead, method: "pushname-fuzzy" };
      }
    }
  }

  return { lead: null, method: "none" };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const headerKey =
      request.headers.get("apikey") ?? request.headers.get("x-api-key");
    const bodyKey = typeof body.apikey === "string" ? body.apikey : undefined;
    const webhookKey = headerKey ?? bodyKey;
    const matchedInstance = webhookKey ? getInstanceByKey(webhookKey) : undefined;

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

    const webhookInstanceName = resolvedInstance?.name ?? "";

    logWebhook(body);

    const rawEvent = (body.event as string) ?? "";
    const event = rawEvent.toLowerCase().replace(/_/g, ".");
    const MESSAGE_EVENTS = ["messages.upsert", "send.message", "messages.update"];

    if (!MESSAGE_EVENTS.includes(event)) {
      return Response.json({ ok: true });
    }

    const data = body.data;
    if (!data?.key) return Response.json({ ok: true });

    if (event === "messages.update" && data.update?.status !== undefined) {
      return Response.json({ ok: true });
    }

    const isFromMe = event === "send.message" || !!data.key.fromMe;
    const remoteJid: string = data.key.remoteJid ?? "";

    if (remoteJid.endsWith("@g.us")) return Response.json({ ok: true });

    const jidValue = remoteJid.split("@")[0];
    if (!jidValue) return Response.json({ ok: true });

    // @lid-only inbounds we can't resolve to a phone are dropped — modelo BR
    // tradicional não tem o problema do US/odonto onde @lid era comum.
    if (remoteJid.endsWith("@lid")) {
      console.log("[webhook] @lid inbound dropped (no resolution path):", jidValue);
      return Response.json({ ok: true });
    }

    // Idempotency via provider_message_id (Evolution retries reuse `data.key.id`).
    const keyId = typeof data.key?.id === "string" ? data.key.id.trim() : "";
    const fallbackMsgId = typeof data.messageId === "string" ? data.messageId.trim() : "";
    const providerMessageId: string | null = keyId || fallbackMsgId || null;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );

    if (providerMessageId) {
      const { data: duplicate } = await supabase
        .from("conversations")
        .select("place_id")
        .eq("provider_message_id", providerMessageId)
        .limit(1)
        .maybeSingle();

      if (duplicate) return Response.json({ ok: true });
    }

    const phone = jidValue;
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

    if (!text) return Response.json({ ok: true });

    const normalizedPhone = phone ? normalizePhone(phone) : "";
    const preview = text.length > 60 ? text.slice(0, 60) + "…" : text;
    console.log(
      `[webhook] ${isFromMe ? "OUT" : "IN"} phone:`,
      normalizedPhone || "(none)",
      preview,
    );

    const matchResult = await matchLead({
      supabase,
      remoteJid,
      normalizedPhone,
      pushName: data.pushName ?? "",
      webhookInstanceName,
    });
    const lead = matchResult.lead;

    console.log(
      "[webhook:match] direction:",
      isFromMe ? "OUT" : "IN",
      "remoteJid:",
      remoteJid,
      "phone:",
      normalizedPhone || "(none)",
      "method:",
      matchResult.method,
      "matched:",
      lead?.place_id ?? "(none)",
    );

    const timestamp = data.messageTimestamp;
    const parsedTs = parseEventTimestampToIso(timestamp);
    const sentAt = parsedTs.iso;

    let placeId: string;
    let leadStatus: string | null = null;

    if (lead) {
      placeId = lead.place_id;
      leadStatus = lead.status;

      const leadUpdates: Record<string, string> = {};

      // Backfill phone if missing
      if (isValidPhone(normalizedPhone) && !lead.phone) {
        leadUpdates.phone = normalizedPhone;
      }

      // Backfill JID if missing
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
      // Outbound echo with no matching lead — drop it. We don't create
      // unknown_ shadows from outbound (would only generate noise).
      return Response.json({ ok: true });
    } else {
      // Genuine unknown inbound with valid phone → create unknown_<phone>
      // shadow so the inbox surfaces it for manual triage.
      if (!isValidPhone(normalizedPhone)) {
        console.log("[webhook] inbound with no valid phone, dropping");
        return Response.json({ ok: true });
      }

      const pushName: string = data.pushName ?? "";
      placeId = `unknown_${normalizedPhone}`;

      console.warn(
        "[webhook:match] creating unknown_ shadow — place_id:",
        placeId,
        "pushName:",
        pushName,
      );

      await supabase
        .from("leads")
        .upsert(
          {
            place_id: placeId,
            business_name: pushName || normalizedPhone,
            outreach_channel: "whatsapp",
            evolution_instance: webhookInstanceName,
            whatsapp_jid: remoteJid,
            status: "replied",
            niche: "inbound",
            status_updated_at: new Date().toISOString(),
            last_inbound_at: sentAt,
            last_human_reply_at: sentAt,
            phone: normalizedPhone,
          },
          { onConflict: "place_id" },
        );
    }

    // ── Outbound echo path ──────────────────────────────────────────────
    if (isFromMe) {
      const { error: outInsertErr } = await supabase
        .from("conversations")
        .insert({
          place_id: placeId,
          direction: "out",
          channel: "whatsapp",
          message: text,
          sent_at: sentAt,
          suggested_by_ai: false,
          provider_message_id: providerMessageId,
        });

      if (outInsertErr) {
        if (outInsertErr.code === "23505") return Response.json({ ok: true });
        console.error("[webhook] outbound insert failed:", outInsertErr.message);
        return Response.json({ ok: true });
      }

      // Mirror dispatch.ts transitions for outbound that originated outside
      // the dashboard (Levi sending from his phone directly):
      //   prospected → sent
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

      await supabase.from("leads").update(outboundPatch).eq("place_id", placeId);

      return Response.json({ ok: true });
    }

    // ── Inbound path ────────────────────────────────────────────────────
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
      const { error: autoInsertErr } = await supabase
        .from("conversations")
        .insert({
          place_id: placeId,
          direction: "in",
          channel: "whatsapp",
          message: text,
          sent_at: sentAt,
          suggested_by_ai: false,
          approved_by: "auto-reply",
          provider_message_id: providerMessageId,
        });

      if (autoInsertErr) {
        if (autoInsertErr.code === "23505") return Response.json({ ok: true });
        console.error("[webhook] auto-reply insert failed:", autoInsertErr.message);
        return Response.json({ ok: true });
      }

      await supabase
        .from("leads")
        .update({ last_inbound_at: sentAt, last_auto_reply_at: sentAt })
        .eq("place_id", placeId);

      return Response.json({ ok: true });
    }

    const { error: inInsertErr } = await supabase
      .from("conversations")
      .insert({
        place_id: placeId,
        direction: "in",
        channel: "whatsapp",
        message: text,
        sent_at: sentAt,
        suggested_by_ai: false,
        provider_message_id: providerMessageId,
      });

    if (inInsertErr) {
      if (inInsertErr.code === "23505") return Response.json({ ok: true });
      console.error("[webhook] inbound insert failed:", inInsertErr.message);
      return Response.json({ ok: true });
    }

    await onInboundLeadMessage(supabase, placeId, sentAt, leadStatus);

    return Response.json({ ok: true });
  } catch (err) {
    console.error(
      "[webhook] catch-all —",
      "error:",
      err instanceof Error ? err.message : String(err),
      "stack:",
      err instanceof Error ? err.stack?.split("\n").slice(0, 3).join(" | ") : "(none)",
    );
    return Response.json({ ok: true });
  }
}
