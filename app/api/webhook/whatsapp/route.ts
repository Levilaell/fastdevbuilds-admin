import { createClient } from "@supabase/supabase-js";
import { getRecentConversations } from "@/lib/supabase/queries";
import { isAutoReply, isInstantReply } from "@/lib/auto-reply";
import {
  normalizePhone,
  phoneMatch,
  getInstances,
  getInstanceByKey,
  isValidPhone,
  pickCanonicalJid,
  resolvePhoneFromLid,
} from "@/lib/whatsapp";
import { onInboundLeadMessage } from "@/lib/leads/on-inbound";
import { logWebhook } from "./debug/route";
import type { Lead } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Window (ms) used to attribute ambiguous LID inbounds to recent outbound
 * sends on the same instance. Kept conservative to avoid cross-lead bleed.
 */
const INSTANCE_ATTRIBUTION_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Text-echo strategy (match method #3): only consider outbounds whose
 * `outreach_sent_at` falls inside this window. Outside it, equal text is
 * almost always cross-lead noise rather than a real echo.
 */
const TEXT_ECHO_WINDOW_MS = 10 * 60 * 1000;

/**
 * Minimum message length for text-echo matching. Short messages (`"oi"`,
 * `"teste"`, diagnostic pings) collide across unrelated leads; observed in
 * production as the main source of wrong attributions on method #3.
 */
const TEXT_ECHO_MIN_LENGTH = 30;

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

  // 3. outbound echo by message text (bot-sent leads, pre-PR1 legacy path).
  // Hardened in PR 2 after production incidents where short or generic
  // texts ("oi", diag pings) collided with unrelated leads:
  //   - requires fromMe=true AND text.length >= TEXT_ECHO_MIN_LENGTH
  //   - limits candidates to outbounds in the last TEXT_ECHO_WINDOW_MS
  //   - leaves `outreach_sent` NOT gated (bot race still possible) but the
  //     length + window constraints alone are enough to stop the bleed.
  if (isFromMe && text && text.length >= TEXT_ECHO_MIN_LENGTH) {
    const since = new Date(Date.now() - TEXT_ECHO_WINDOW_MS).toISOString();
    const { data: textHit } = await supabase
      .from("leads")
      .select(`${LEAD_SELECT}, outreach_sent_at`)
      .eq("evolution_instance", webhookInstanceName)
      .eq("message", text)
      .is("whatsapp_jid", null)
      .gte("outreach_sent_at", since)
      .order("outreach_sent_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (textHit) {
      const sentAtRaw = textHit.outreach_sent_at as string | null;
      const ageMin = sentAtRaw
        ? Math.floor((Date.now() - new Date(sentAtRaw).getTime()) / 60_000)
        : -1;
      console.log(
        "[webhook:match] method=text-echo place_id=",
        textHit.place_id,
        "msg_len=",
        text.length,
        "age_min=",
        ageMin,
      );
      return {
        lead: {
          place_id: textHit.place_id as string,
          phone: (textHit.phone as string | null) ?? null,
          status: textHit.status as string,
          evolution_instance:
            (textHit.evolution_instance as string | null) ?? null,
          whatsapp_jid: (textHit.whatsapp_jid as string | null) ?? null,
        },
        method: "text-echo",
      };
    }
    console.log(
      "[webhook:match] text-echo miss on instance",
      webhookInstanceName,
      "— text preview:",
      text.slice(0, 60),
    );
  } else if (isFromMe && text && text.length < TEXT_ECHO_MIN_LENGTH) {
    console.log(
      "[webhook:match] text-echo skipped — msg too short, len=",
      text.length,
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

/**
 * Persist a webhook event we couldn't safely attribute to a lead. Replaces
 * the old "create unknown_<lid>@lid shadow lead" behaviour, which then
 * hijacked the JID-exact match path for all subsequent messages from that
 * contact. The quarantine table is write-only from here; a reconciliation
 * worker will attempt to map these to real leads later.
 */
async function quarantineInbound(opts: {
  supabase: SupabaseClient;
  providerMessageId: string | null;
  remoteJid: string;
  pushName: string | null;
  messageText: string;
  instance: string;
  fromMe: boolean;
  reason: "lid_unresolved" | "no_match" | "other";
  rawPayload: unknown;
}): Promise<void> {
  const { error } = await opts.supabase
    .from("webhook_inbound_quarantine")
    .insert({
      provider_message_id: opts.providerMessageId,
      remote_jid: opts.remoteJid,
      push_name: opts.pushName,
      message_text: opts.messageText,
      evolution_instance: opts.instance || null,
      from_me: opts.fromMe,
      reason: opts.reason,
      raw_payload: opts.rawPayload,
    });

  if (error) {
    console.error(
      "[webhook:quarantine] insert failed —",
      "reason:",
      opts.reason,
      "jid:",
      opts.remoteJid,
      "error:",
      error.message,
    );
    return;
  }

  console.log(
    "[webhook:quarantine] jid=",
    opts.remoteJid,
    "reason=",
    opts.reason,
    "provider_id=",
    opts.providerMessageId ?? "(none)",
  );
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

    // Idempotency: Evolution retries and replayed webhook batches reliably
    // include the same `data.key.id`; using it as our dedup key eliminates
    // the fragile ±5s / 120s time-window checks the handler used before.
    const keyId =
      typeof data.key?.id === "string" ? data.key.id.trim() : "";
    const fallbackMsgId =
      typeof data.messageId === "string" ? data.messageId.trim() : "";
    const providerMessageId: string | null =
      keyId || fallbackMsgId || null;
    if (!providerMessageId) {
      console.warn(
        "[webhook:no-provider-id] event=",
        event,
        "remoteJid=",
        remoteJid,
      );
    }

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

      if (duplicate) {
        console.log(
          "[webhook:dedup] provider_id=",
          providerMessageId,
          "place_id=",
          duplicate.place_id,
        );
        return Response.json({ ok: true });
      }
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

      // Phone: only fill when NULL. When the stored phone differs from what
      // we resolved (e.g. resolvePhoneFromLid's picture-matching heuristic
      // got it wrong), trust the one recorded at collect time — it came
      // from Google Places / the scraper and is more reliable than
      // Evolution's contact endpoint.
      if (isValidPhone(normalizedPhone)) {
        if (!lead.phone) {
          leadUpdates.phone = normalizedPhone;
        } else if (normalizePhone(lead.phone) !== normalizedPhone) {
          console.warn(
            "[webhook:lid-phone-mismatch] place_id=",
            placeId,
            "stored=",
            lead.phone,
            "incoming=",
            normalizedPhone,
          );
        }
      }

      // JID: use pickCanonicalJid so a canonical `@s.whatsapp.net` is never
      // downgraded to `@lid` when Evolution temporarily migrates the
      // contact. Fills NULL and upgrades `@lid` → `@s.whatsapp.net`.
      if (remoteJid) {
        const desiredJid = pickCanonicalJid(lead.whatsapp_jid, remoteJid);
        if (desiredJid && desiredJid !== lead.whatsapp_jid) {
          leadUpdates.whatsapp_jid = desiredJid;
          if (lead.whatsapp_jid) {
            console.log(
              "[webhook:match] refreshing jid for",
              placeId,
              "old:",
              lead.whatsapp_jid,
              "new:",
              desiredJid,
            );
          }
        } else if (lead.whatsapp_jid && lead.whatsapp_jid !== remoteJid) {
          console.log(
            "[webhook:match] keeping canonical jid for",
            placeId,
            "stored:",
            lead.whatsapp_jid,
            "ignored incoming:",
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
      // Genuine unknown inbound. Two branches:
      //   a) @lid with no resolvable phone (or invalid resolution) →
      //      quarantine. Creating `unknown_<lid>@lid` here was the source
      //      of the 65 shadow leads in production that hijacked all
      //      subsequent messages via match path #1 (jid-exact).
      //   b) @s.whatsapp.net with a valid normalized phone → create the
      //      traditional `unknown_<phone>` shadow so the inbox surfaces it
      //      for manual triage.
      if (isLid || !isValidPhone(normalizedPhone)) {
        await quarantineInbound({
          supabase,
          providerMessageId,
          remoteJid,
          pushName: data.pushName ?? null,
          messageText: text,
          instance: webhookInstanceName,
          fromMe: isFromMe,
          reason: isLid ? "lid_unresolved" : "no_match",
          rawPayload: body,
        });
        return Response.json({ ok: true });
      }

      const pushName: string = data.pushName ?? "";
      placeId = `unknown_${normalizedPhone}`;

      console.warn(
        "[webhook:match] creating unknown_ shadow —",
        "place_id:",
        placeId,
        "remoteJid:",
        remoteJid,
        "instance:",
        webhookInstanceName || "(none)",
        "— all 4 match steps failed; investigate match log above",
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

    // ── Outbound echo path ────────────────────────────────────────────────
    // Dedup is owned by `provider_message_id` (unique index) — the early
    // check + this insert's UNIQUE constraint together replace the old
    // ±120s time-window SELECT that used to sit here.
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
        if (outInsertErr.code === "23505") {
          console.log(
            "[webhook:dedup] unique-violation on outbound insert provider_id=",
            providerMessageId,
            "place_id=",
            placeId,
          );
          return Response.json({ ok: true });
        }
        console.error(
          "[webhook] outbound insert failed:",
          outInsertErr.message,
        );
        return Response.json({ ok: true });
      }

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

      const { error: outboundPatchError } = await supabase
        .from("leads")
        .update(outboundPatch)
        .eq("place_id", placeId);
      if (outboundPatchError) {
        console.error(
          "[webhook] outbound patch update failed:",
          outboundPatchError.message,
          { placeId, leadStatus },
        );
      }

      return Response.json({ ok: true });
    }

    // ── Inbound path ─────────────────────────────────────────────────────
    // No time-window dedup — `provider_message_id` UNIQUE handles replays.

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
        if (autoInsertErr.code === "23505") {
          console.log(
            "[webhook:dedup] unique-violation on auto-reply insert provider_id=",
            providerMessageId,
            "place_id=",
            placeId,
          );
          return Response.json({ ok: true });
        }
        console.error(
          "[webhook] auto-reply insert failed:",
          autoInsertErr.message,
        );
        return Response.json({ ok: true });
      }

      await supabase
        .from("leads")
        .update({
          last_inbound_at: sentAt,
          last_auto_reply_at: sentAt,
        })
        .eq("place_id", placeId);


      return Response.json({ ok: true });
    }

    const { data: conv, error: inInsertErr } = await supabase
      .from("conversations")
      .insert({
        place_id: placeId,
        direction: "in",
        channel: "whatsapp",
        message: text,
        sent_at: sentAt,
        suggested_by_ai: false,
        provider_message_id: providerMessageId,
      })
      .select("id")
      .single();

    if (inInsertErr) {
      if (inInsertErr.code === "23505") {
        console.log(
          "[webhook:dedup] unique-violation on inbound insert provider_id=",
          providerMessageId,
          "place_id=",
          placeId,
        );
        return Response.json({ ok: true });
      }
      console.error("[webhook] inbound insert failed:", inInsertErr.message);
      return Response.json({ ok: true });
    }

    await onInboundLeadMessage(supabase, placeId, sentAt, leadStatus);



    return Response.json({ ok: true });
  } catch (err) {
    console.error("[webhook] error:", err);
    return Response.json({ ok: true });
  }
}
