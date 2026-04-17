import { verifyBotAuth } from "@/lib/auth/bot-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { recordOutboundMessage } from "@/lib/messages/record-outbound";
import { extractProviderMessageId, extractRemoteJid } from "@/lib/whatsapp";

interface SentPayload {
  place_id: string;
  channel: "whatsapp" | "email";
  message: string;
  subject: string | null;
  evolution_response: unknown;
  evolution_instance: string | null;
  sent_at?: string;
  is_follow_up: boolean;
  /**
   * Optional override for the Evolution `key.id`. When omitted, it is
   * extracted from `evolution_response`. Callers pass this only when they
   * generated the id upstream (rare).
   */
  provider_message_id?: string | null;
}

type ValidationResult =
  | { ok: true; payload: SentPayload }
  | { ok: false; error: string };

function validatePayload(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = raw as Record<string, unknown>;

  if (typeof b.place_id !== "string" || !b.place_id.trim()) {
    return { ok: false, error: "place_id is required" };
  }
  if (b.channel !== "whatsapp" && b.channel !== "email") {
    return { ok: false, error: "channel must be 'whatsapp' or 'email'" };
  }
  if (typeof b.message !== "string" || !b.message) {
    return { ok: false, error: "message is required" };
  }
  if (b.subject != null && typeof b.subject !== "string") {
    return { ok: false, error: "subject must be string or null" };
  }
  if (
    b.evolution_instance != null &&
    typeof b.evolution_instance !== "string"
  ) {
    return { ok: false, error: "evolution_instance must be string or null" };
  }
  if (b.sent_at != null && typeof b.sent_at !== "string") {
    return { ok: false, error: "sent_at must be an ISO 8601 string" };
  }
  if (b.is_follow_up != null && typeof b.is_follow_up !== "boolean") {
    return { ok: false, error: "is_follow_up must be boolean" };
  }
  if (
    b.provider_message_id != null &&
    typeof b.provider_message_id !== "string"
  ) {
    return {
      ok: false,
      error: "provider_message_id must be string or null",
    };
  }

  let providerMessageIdOverride: string | null | undefined;
  if (typeof b.provider_message_id === "string") {
    const trimmed = b.provider_message_id.trim();
    providerMessageIdOverride = trimmed ? trimmed : null;
  } else if (b.provider_message_id === null) {
    providerMessageIdOverride = null;
  } else {
    providerMessageIdOverride = undefined;
  }

  return {
    ok: true,
    payload: {
      place_id: b.place_id,
      channel: b.channel,
      message: b.message,
      subject: typeof b.subject === "string" ? b.subject : null,
      evolution_response: b.evolution_response,
      evolution_instance:
        typeof b.evolution_instance === "string" ? b.evolution_instance : null,
      sent_at: typeof b.sent_at === "string" ? b.sent_at : undefined,
      is_follow_up: b.is_follow_up === true,
      provider_message_id: providerMessageIdOverride,
    },
  };
}

export async function POST(request: Request) {
  const auth = verifyBotAuth(request);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const validation = validatePayload(raw);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }
  const { payload } = validation;

  // Extract remoteJid from the raw Evolution send response when available.
  // LID-shaped JIDs (@lid) are stored as-is — fixing LID handling is a
  // separate PR; silently dropping them would regress today's behavior.
  let whatsapp_jid: string | null = null;
  if (payload.channel === "whatsapp" && payload.evolution_response) {
    whatsapp_jid = extractRemoteJid(payload.evolution_response) ?? null;
  }

  // Prefer the explicit override (undefined = not provided). Else extract
  // `key.id` from the Evolution send response so later retries can be
  // deduped against the `provider_message_id` UNIQUE index.
  let provider_message_id: string | null;
  if (payload.provider_message_id !== undefined) {
    provider_message_id = payload.provider_message_id;
  } else if (payload.evolution_response) {
    provider_message_id =
      extractProviderMessageId(payload.evolution_response) ?? null;
  } else {
    provider_message_id = null;
  }

  const supabase = createServiceClient();
  const sentAt = payload.sent_at ?? new Date().toISOString();

  const recorded = await recordOutboundMessage({
    supabase,
    place_id: payload.place_id,
    channel: payload.channel,
    message: payload.message,
    subject: payload.subject,
    whatsapp_jid,
    evolution_instance: payload.evolution_instance,
    suggested_by_ai: false,
    is_follow_up: payload.is_follow_up,
    sent_at: sentAt,
    provider_message_id,
  });

  if (!recorded.ok) {
    if (recorded.error === "lead_not_found") {
      console.warn(
        "[bot-outreach:sent] lead not found place_id=",
        payload.place_id,
      );
      return Response.json(
        {
          error:
            "lead_not_found: bot must upsert the lead before calling this endpoint",
        },
        { status: 404 },
      );
    }
    console.error(
      "[bot-outreach:sent] record failed place_id=",
      payload.place_id,
      "error=",
      recorded.error,
    );
    return Response.json({ error: recorded.error }, { status: 500 });
  }

  if (recorded.idempotent) {
    console.log(
      "[bot-outreach:sent] idempotent replay place_id=",
      payload.place_id,
      "channel=",
      payload.channel,
      "provider_id=",
      provider_message_id ?? "(none)",
    );
    return Response.json({
      ok: true,
      conversation_id: recorded.conversation_id,
      idempotent: true,
    });
  }

  console.log(
    "[bot-outreach:sent] place_id=",
    payload.place_id,
    "channel=",
    payload.channel,
    "jid=",
    whatsapp_jid ?? "(none)",
    "instance=",
    payload.evolution_instance ?? "(none)",
    "provider_id=",
    provider_message_id ?? "(none)",
  );

  return Response.json({
    ok: true,
    conversation_id: recorded.conversation_id,
  });
}
