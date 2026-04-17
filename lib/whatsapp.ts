import type { SupabaseClient } from "@supabase/supabase-js";

/** Normalize a Brazilian phone to 55 + DDD + number (12-13 digits). */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13)
    return digits;
  const clean = digits.startsWith("0") ? digits.slice(1) : digits;
  if (clean.length >= 10 && clean.length <= 11) return `55${clean}`;
  return digits;
}

/** Check if two phone strings match after normalization. */
export function phoneMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  return na === nb;
}

// ─── Multi-instance Evolution API support ────────────────────────────────────

export interface EvolutionInstance {
  name: string;
  apiKey: string;
}

let cachedInstances: EvolutionInstance[] | null = null;

/**
 * Load Evolution API instances.
 *
 * Priority:
 *   1. EVOLUTION_INSTANCES_JSON  — preferred, fully dynamic
 *   2. Numbered env vars (EVOLUTION_INSTANCE_1 … _20) — legacy fallback,
 *      scans through gaps so a missing _2 won't hide _3
 *
 * Result is cached for the lifetime of the process.
 */
export function getInstances(): EvolutionInstance[] {
  if (cachedInstances) return cachedInstances;

  const json = process.env.EVOLUTION_INSTANCES_JSON?.trim();

  if (json) {
    cachedInstances = parseInstancesJson(json);
  } else {
    cachedInstances = loadLegacyInstances();
  }

  return cachedInstances;
}

function parseInstancesJson(raw: string): EvolutionInstance[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[whatsapp] EVOLUTION_INSTANCES_JSON is not valid JSON — falling back to numbered env vars");
    return loadLegacyInstances();
  }

  if (!Array.isArray(parsed)) {
    console.error("[whatsapp] EVOLUTION_INSTANCES_JSON must be a JSON array — falling back to numbered env vars");
    return loadLegacyInstances();
  }

  const instances: EvolutionInstance[] = [];
  for (const entry of parsed) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).name === "string" &&
      typeof (entry as Record<string, unknown>).apiKey === "string" &&
      (entry as Record<string, unknown>).name &&
      (entry as Record<string, unknown>).apiKey
    ) {
      instances.push({
        name: (entry as Record<string, string>).name,
        apiKey: (entry as Record<string, string>).apiKey,
      });
    } else {
      console.warn("[whatsapp] skipping invalid entry in EVOLUTION_INSTANCES_JSON:", entry);
    }
  }

  return instances;
}

/** Scan EVOLUTION_INSTANCE_1 … _20, skipping gaps. */
function loadLegacyInstances(): EvolutionInstance[] {
  const instances: EvolutionInstance[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = process.env[`EVOLUTION_INSTANCE_${i}`];
    const apiKey = process.env[`EVOLUTION_API_KEY_${i}`];
    if (name && apiKey) {
      instances.push({ name, apiKey });
    }
    // no break — scan through gaps
  }
  return instances;
}

/** Clear cached instances (useful for tests or hot-reload scenarios). */
export function resetInstanceCache(): void {
  cachedInstances = null;
}

/** Find an instance by its API key (used by webhook to identify sender). */
export function getInstanceByKey(
  apiKey: string,
): EvolutionInstance | undefined {
  return getInstances().find((inst) => inst.apiKey === apiKey);
}

/** Find an instance by name. */
function getInstanceByName(name: string): EvolutionInstance | undefined {
  return getInstances().find((inst) => inst.name === name);
}

/**
 * Look up a lead's assigned instance. If none, assign the next one via
 * least-sends-in-last-24h and persist the assignment on the lead.
 */
export async function getOrAssignInstance(
  supabase: SupabaseClient,
  placeId: string,
): Promise<EvolutionInstance | null> {
  const instances = getInstances();
  if (instances.length === 0) return null;

  const { data: lead } = await supabase
    .from("leads")
    .select("evolution_instance")
    .eq("place_id", placeId)
    .maybeSingle();

  if (lead?.evolution_instance) {
    const existing = getInstanceByName(lead.evolution_instance);
    if (existing) return existing;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: sent } = await supabase
    .from("leads")
    .select("evolution_instance")
    .not("evolution_instance", "is", null)
    .not("outreach_sent_at", "is", null)
    .gte("outreach_sent_at", since);

  const countMap = new Map<string, number>();
  for (const inst of instances) countMap.set(inst.name, 0);
  for (const row of sent ?? []) {
    const name = row.evolution_instance as string;
    if (countMap.has(name)) countMap.set(name, (countMap.get(name) ?? 0) + 1);
  }

  let assigned = instances[0];
  let minCount = Infinity;
  for (const inst of instances) {
    const c = countMap.get(inst.name) ?? 0;
    if (c < minCount) {
      minCount = c;
      assigned = inst;
    }
  }

  await supabase
    .from("leads")
    .update({ evolution_instance: assigned.name })
    .eq("place_id", placeId);

  console.log(
    `[whatsapp] assigned instance "${assigned.name}" to lead ${placeId}`,
  );
  return assigned;
}

/** Check if a normalized phone looks like a valid BR number. */
export function isValidPhone(phone: string): boolean {
  return phone.startsWith("55") && phone.length >= 12 && phone.length <= 13;
}

/**
 * Decide which JID to persist when current and incoming forms differ.
 *
 * Evolution migrates contacts between `@s.whatsapp.net` (phone-based,
 * canonical) and `@lid` (opaque, session-scoped). A naïve "overwrite on
 * every event" strategy causes the stored JID to flap, which in turn
 * breaks JID-exact matching for the other side of the flap.
 *
 * Rules (strictly ordered):
 *   1. incoming is NULL → keep current (nothing to do).
 *   2. current is NULL → take incoming.
 *   3. values equal → keep current (no-op).
 *   4. current @s.whatsapp.net, incoming @lid → keep current
 *      (do NOT downgrade the canonical phone-JID).
 *   5. current @lid, incoming @s.whatsapp.net → take incoming
 *      (upgrade to canonical).
 *   6. anything else (unexpected mix) → keep current (conservative).
 *
 * Returns the JID that SHOULD be stored. Callers write only when the
 * returned value differs from `current`.
 */
export function pickCanonicalJid(
  current: string | null,
  incoming: string | null,
): string | null {
  if (!incoming) return current;
  if (!current) return incoming;
  if (current === incoming) return current;

  const currentIsPhone = current.endsWith("@s.whatsapp.net");
  const incomingIsPhone = incoming.endsWith("@s.whatsapp.net");
  const currentIsLid = current.endsWith("@lid");
  const incomingIsLid = incoming.endsWith("@lid");

  if (currentIsPhone && incomingIsLid) return current;
  if (currentIsLid && incomingIsPhone) return incoming;

  return current;
}

/**
 * Resolve a LID (Link ID) to a real phone number via Evolution API.
 * Evolution API v1.x sends LID format (240552629022900@lid) in webhooks
 * which does NOT contain the phone number and cannot be used for sending.
 *
 * Strategy: get the LID contact's profilePictureUrl, then find the
 * @s.whatsapp.net contact with the same picture — that has the real number.
 */
export async function resolvePhoneFromLid(
  lid: string,
  instanceName?: string,
  instanceApiKey?: string,
): Promise<string | null> {
  const evoUrl = process.env.EVOLUTION_API_URL;
  const fallback = getInstances()[0];
  const instance = instanceName || fallback?.name;
  const apiKey = instanceApiKey || fallback?.apiKey;

  if (!evoUrl || !instance || !apiKey) return null;

  const headers = { "Content-Type": "application/json", apikey: apiKey };

  try {
    const lidRes = await fetch(`${evoUrl}/chat/findContacts/${instance}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ where: { id: `${lid}@lid` } }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!lidRes.ok) return null;

    const lidContacts = await lidRes.json();
    if (!Array.isArray(lidContacts) || lidContacts.length === 0) return null;

    const lidPic: string = lidContacts[0].profilePictureUrl ?? "";
    if (!lidPic) {
      console.log(
        "[whatsapp] LID contact has no profile picture, cannot resolve",
      );
      return null;
    }

    const matchRes = await fetch(`${evoUrl}/chat/findContacts/${instance}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ where: { profilePictureUrl: lidPic } }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!matchRes.ok) return null;

    const matchContacts = await matchRes.json();
    if (!Array.isArray(matchContacts)) return null;

    const match = matchContacts.find(
      (c: { id: string; profilePictureUrl?: string }) =>
        c.id.endsWith("@s.whatsapp.net") && c.profilePictureUrl === lidPic,
    );

    if (match) {
      const realPhone = match.id.split("@")[0].replace(/\D/g, "");
      console.log("[whatsapp] resolved LID", lid, "→", realPhone);
      return realPhone;
    }

    console.log(
      "[whatsapp] no @s.whatsapp.net match found for LID profile picture",
    );
    return null;
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      console.error("[whatsapp] resolvePhoneFromLid timeout for LID", lid);
    } else {
      console.error("[whatsapp] resolvePhoneFromLid error:", err);
    }
    return null;
  }
}

export type SendResult =
  | { ok: true; remoteJid?: string }
  | { ok: false; reason: string; status?: number; body?: string };

/**
 * Extract remoteJid from an Evolution API send response (stringified JSON or
 * already-parsed object). Evolution versions differ in envelope shape —
 * we try every known location in priority order and return the first match.
 */
export function extractRemoteJid(body: string | unknown): string | undefined {
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    const jid =
      parsed?.key?.remoteJid ??
      parsed?.data?.key?.remoteJid ??
      parsed?.message?.key?.remoteJid ??
      parsed?.response?.key?.remoteJid ??
      parsed?.result?.key?.remoteJid ??
      parsed?.messages?.[0]?.key?.remoteJid ??
      parsed?.jid ??
      parsed?.remoteJid;
    return typeof jid === "string" && jid.includes("@") ? jid : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract `key.id` from an Evolution send response. Shape varies by Evolution
 * version (and between send-response vs webhook envelopes), so we try every
 * known location in priority order — same pattern as `extractRemoteJid`.
 *
 * The returned id is the provider-supplied message id used as the dedup key
 * by the `conversations.provider_message_id` UNIQUE index (PR 2).
 */
export function extractProviderMessageId(
  body: string | unknown,
): string | undefined {
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    const id =
      parsed?.key?.id ??
      parsed?.data?.key?.id ??
      parsed?.message?.key?.id ??
      parsed?.response?.key?.id ??
      parsed?.result?.key?.id ??
      parsed?.messages?.[0]?.key?.id ??
      parsed?.messageId ??
      parsed?.id;
    if (typeof id !== "string") return undefined;
    const trimmed = id.trim();
    return trimmed ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Look up the canonical WhatsApp JID for a phone on a given instance.
 *
 * Uses Evolution's `/chat/whatsappNumbers/{instance}` endpoint, which maps
 * phone numbers to their canonical JID — including `@lid` form for contacts
 * that WhatsApp has migrated off phone-based identifiers.
 *
 * This is the *reliable* way to populate `whatsapp_jid` — unlike parsing the
 * send response (shape varies) or the webhook echo (racy / config-dependent).
 */
export async function lookupJidFromPhone(
  phone: string,
  instanceName?: string,
  instanceApiKey?: string,
): Promise<string | null> {
  const evoUrl = process.env.EVOLUTION_API_URL;
  const fallback = getInstances()[0];
  const instance = instanceName || fallback?.name;
  const apiKey = instanceApiKey
    || (instanceName ? getInstanceByName(instanceName)?.apiKey : undefined)
    || fallback?.apiKey;

  if (!evoUrl || !instance || !apiKey || !phone) {
    console.log(
      "[whatsapp:lookup] missing config — evoUrl:",
      !!evoUrl,
      "instance:",
      instance,
      "apiKey:",
      !!apiKey,
      "phone:",
      !!phone,
    );
    return null;
  }

  const cleanPhone = normalizePhone(phone);
  if (!isValidPhone(cleanPhone)) {
    console.log("[whatsapp:lookup] invalid phone after normalization:", cleanPhone);
    return null;
  }

  const headers = { "Content-Type": "application/json", apikey: apiKey };
  const endpoint = `${evoUrl}/chat/whatsappNumbers/${instance}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ numbers: [cleanPhone] }),
      signal: AbortSignal.timeout(8_000),
    });

    const bodyText = await res.text();

    if (!res.ok) {
      console.warn(
        "[whatsapp:lookup] non-ok status",
        res.status,
        "for",
        cleanPhone,
        "body:",
        bodyText.slice(0, 200),
      );
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      console.warn(
        "[whatsapp:lookup] non-JSON response for",
        cleanPhone,
        ":",
        bodyText.slice(0, 200),
      );
      return null;
    }

    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { numbers?: unknown[] })?.numbers)
        ? (parsed as { numbers: unknown[] }).numbers
        : null;

    if (!list || list.length === 0) {
      console.log(
        "[whatsapp:lookup] empty response for",
        cleanPhone,
        "raw:",
        bodyText.slice(0, 200),
      );
      return null;
    }

    const entry = list[0] as {
      exists?: boolean;
      jid?: string;
      number?: string;
    };

    if (entry.exists === false) {
      console.log("[whatsapp:lookup] number not on whatsapp:", cleanPhone);
      return null;
    }

    const jid = typeof entry.jid === "string" && entry.jid.includes("@")
      ? entry.jid
      : null;

    if (!jid) {
      console.log(
        "[whatsapp:lookup] no jid in response for",
        cleanPhone,
        "entry:",
        entry,
      );
      return null;
    }

    console.log("[whatsapp:lookup]", cleanPhone, "→", jid);
    return jid;
  } catch (err) {
    const name = err instanceof Error ? err.name : "Unknown";
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "[whatsapp:lookup] fetch failed for",
      cleanPhone,
      ":",
      name,
      message,
    );
    return null;
  }
}

/**
 * Send a WhatsApp message via Evolution API.
 * If instanceName is provided, uses that specific instance.
 * Otherwise uses the first configured instance as fallback.
 */
export async function sendWhatsApp(
  phone: string,
  text: string,
  instanceName?: string,
): Promise<SendResult> {
  const url = process.env.EVOLUTION_API_URL;
  if (!url) {
    return { ok: false, reason: "missing_url" };
  }

  const instances = getInstances();
  if (instances.length === 0) {
    return { ok: false, reason: "no_instances" };
  }

  let instance = instances[0];
  if (instanceName) {
    const found = instances.find((i) => i.name === instanceName);
    if (found) {
      instance = found;
    } else {
      console.warn(
        "[whatsapp] instance",
        instanceName,
        "not found in config — falling back to",
        instances[0].name,
      );
    }
  }

  const cleanPhone = normalizePhone(phone);
  if (!isValidPhone(cleanPhone)) {
    return { ok: false, reason: "invalid_phone" };
  }

  const endpoint = `${url}/message/sendText/${instance.name}`;
  const payload = { number: cleanPhone, textMessage: { text } };

  console.log("[whatsapp] sending to", cleanPhone, "via", endpoint);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: instance.apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    const body = await res.text();
    const parsedJid = extractRemoteJid(body);
    console.log(
      "[whatsapp:send] status:",
      res.status,
      "parsedJid:",
      parsedJid ?? "(none)",
      "body:",
      body.slice(0, 500),
    );

    if (!res.ok) {
      // Detect invalid WhatsApp number: Evolution API returns 400 + { "exists": false }
      if (res.status === 400) {
        try {
          const parsed = JSON.parse(body);
          if (parsed && parsed.exists === false) {
            console.warn("[whatsapp] number not on WhatsApp:", cleanPhone);
            return {
              ok: false,
              reason: "number_not_on_whatsapp",
              status: res.status,
              body,
            };
          }
        } catch {
          // Not JSON — fall through to generic provider_error
        }
      }

      return {
        ok: false,
        reason: "provider_error",
        status: res.status,
        body,
      };
    }

    return { ok: true, remoteJid: parsedJid };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp] fetch error:", message);
    return {
      ok: false,
      reason: "network_error",
      body: message,
    };
  }
}
