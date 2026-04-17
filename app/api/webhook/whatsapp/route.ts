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
 * Coerce an Evolution `messageTimestamp` into a valid ISO string.
 *
 * Observed shapes across Evolution versions / payload types:
 *   - unix seconds as number (`1713356400`)
 *   - unix seconds as numeric string (`"1713356400"`)
 *   - ISO / RFC string (`"2026-04-17T12:34:56Z"`)
 *   - protobuf Long object (`{ low, high, unsigned }`)
 *   - null / undefined / empty string
 *
 * The old code did `timestamp ? new Date(Number(timestamp) * 1000) : ...`
 * which produced an Invalid Date for any non-numeric truthy value. Calling
 * `.toISOString()` on an Invalid Date throws RangeError: Invalid time value,
 * crashing the whole webhook handler before lead state could be updated.
 *
 * Returns `{ iso, fallback }` — `fallback = true` means we couldn't parse
 * the incoming timestamp and used `Date.now()` instead.
 */
function parseEventTimestampToIso(raw: unknown): {
  iso: string;
  fallback: boolean;
} {
  const fallback = () => ({ iso: new Date().toISOString(), fallback: true });

  if (raw == null || raw === "") return fallback();

  // protobuf Long → { low, high, unsigned }
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

  // number as unix seconds
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return fallback();
    const d = new Date(raw * 1000);
    if (!Number.isNaN(d.getTime())) return { iso: d.toISOString(), fallback: false };
    return fallback();
  }

  // string — try numeric first, then ISO
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

type MatchMethod =
  | "jid"
  | "phone"
  | "text-echo"
  | "instance-attribution"
  | "none";

interface MatchResult {
  lead: MatchedLead | null;
  method: MatchMethod;
}

/**
 * Match a webhook event against a stored lead using, in order:
 *   1. whatsapp_jid exact match.
 *   2. phone match (after normalization). Unlike JID, phone is stable across
 *      Evolution's `@s.whatsapp.net` ↔ `@lid` migrations.
 *   3. outbound echo by message text (bot-sent leads whose @lid echo arrives
 *      before any whatsapp_jid has been persisted).
 *   4. instance attribution: same instance + recent outbound + no inbound
 *      yet. Fires only when exactly one candidate exists. This is the
 *      critical fallback for the case where dispatch persisted a JID in one
 *      form (e.g. `<phone>@s.whatsapp.net` from `whatsappNumbers`) but the
 *      inbound webhook arrives in a different form (`<lid>@lid`).
 *
 * Returns the matched lead + which method found it. The caller uses the
 * method to decide whether to refresh whatsapp_jid with the incoming form.
 */
async function matchLead(params: {
  supabase: SupabaseClient;
  remoteJid: string;
  normalizedPhone: string;
  isFromMe: boolean;
  text: string;
  webhookInstanceName: string;
}): Promise<MatchResult> {
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
      console.log("[webhook:match] method=jid place_id=", jidLead.place_id);
      return { lead: jidLead as MatchedLead, method: "jid" };
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
      console.log("[webhook:match] method=phone place_id=", phoneHit.place_id);
      return { lead: phoneHit as MatchedLead, method: "phone" };
    }
  }

  if (!webhookInstanceName) return { lead: null, method: "none" };

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
        "[webhook:match] method=text-echo place_id=",
        textHit.place_id,
      );
      return { lead: textHit as MatchedLead, method: "text-echo" };
    }
    console.log(
      "[webhook:match] text-echo miss on instance",
      webhookInstanceName,
      "— text preview:",
      text.slice(0, 60),
    );
  }

  // 4. instance attribution: same instance + recent outbound + no inbound
  // yet. Dropped the `whatsapp_jid IS NULL` filter so leads whose JID was
  // seeded in a different form (e.g. @s.whatsapp.net) can still be matched
  // when the inbound comes as @lid — that was the core reason outbound
  // and inbound ended up on different place_ids.
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
    .order("outreach_sent_at", { ascending: false })
    .limit(2);

  if (candidates && candidates.length === 1) {
    console.log(
      "[webhook:match] method=instance-attribution place_id=",
      candidates[0].place_id,
      "(stored jid:",
      candidates[0].whatsapp_jid,
      ", incoming:",
      remoteJid,
      ")",
    );
    return {
      lead: candidates[0] as MatchedLead,
      method: "instance-attribution",
    };
  }

  if (candidates && candidates.length > 1) {
    console.log(
      "[webhook:match] ambiguous instance attribution on",
      webhookInstanceName,
      "— candidates:",
      candidates.map((c) => c.place_id).join(", "),
    );
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

    const matchResult = await matchLead({
      supabase,
      remoteJid,
      normalizedPhone,
      isFromMe,
      text,
      webhookInstanceName,
    });
    const lead = matchResult.lead;

    console.log(
      "[webhook:match] summary — direction:",
      isFromMe ? "OUT" : "IN",
      "remoteJid:",
      remoteJid,
      "isLid:",
      isLid,
      "normalizedPhone:",
      normalizedPhone || "(none)",
      "instance:",
      webhookInstanceName || "(none)",
      "method:",
      matchResult.method,
      "matchedPlaceId:",
      lead?.place_id ?? "(none)",
      "willCreateUnknown:",
      !lead && !isFromMe,
    );

    const timestamp = data.messageTimestamp;
    const parsedTs = parseEventTimestampToIso(timestamp);
    if (parsedTs.fallback && timestamp != null && timestamp !== "") {
      console.warn(
        "[webhook] invalid messageTimestamp — using now() instead. raw:",
        typeof timestamp,
        JSON.stringify(timestamp).slice(0, 120),
      );
    }
    const sentAt = parsedTs.iso;

    let placeId: string;
    let leadStatus: string | null = null;

    if (lead) {
      placeId = lead.place_id;
      leadStatus = lead.status;

      // Backfill missing identifiers on the matched lead so future events
      // match faster and more reliably.
      const leadUpdates: Record<string, string> = {};

      if (
        isValidPhone(normalizedPhone) &&
        (!lead.phone || normalizePhone(lead.phone) !== normalizedPhone)
      ) {
        leadUpdates.phone = normalizedPhone;
      }

      // Refresh whatsapp_jid when it's missing OR differs from the incoming
      // form. Evolution migrates contacts between `@s.whatsapp.net` and
      // `@lid`; without this, a JID seeded from `lookupJidFromPhone` in one
      // form would never match webhook events arriving in the other form,
      // and every inbound would fall through to `unknown_*`.
      if (remoteJid && lead.whatsapp_jid !== remoteJid) {
        leadUpdates.whatsapp_jid = remoteJid;
        if (lead.whatsapp_jid) {
          console.log(
            "[webhook:match] refreshing jid for",
            placeId,
            "old:",
            lead.whatsapp_jid,
            "new:",
            remoteJid,
          );
        }
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

      console.warn(
        "[webhook:match] creating unknown_ shadow —",
        "place_id:",
        placeId,
        "remoteJid:",
        remoteJid,
        "isLid:",
        isLid,
        "normalizedPhone:",
        normalizedPhone || "(none)",
        "instance:",
        webhookInstanceName || "(none)",
        "— all 4 match steps failed; investigate match log above",
      );

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
