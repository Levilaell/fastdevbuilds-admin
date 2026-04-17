import { verifyBotAuth } from "@/lib/auth/bot-auth";
import { createServiceClient } from "@/lib/supabase/service";

interface FailedPayload {
  place_id: string;
  channel: "whatsapp" | "email";
  error: string;
  error_code: string | null;
  evolution_instance: string | null;
  http_status: number | null;
}

type ValidationResult =
  | { ok: true; payload: FailedPayload }
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
  if (typeof b.error !== "string" || !b.error) {
    return { ok: false, error: "error message is required" };
  }
  if (b.error_code != null && typeof b.error_code !== "string") {
    return { ok: false, error: "error_code must be string or null" };
  }
  if (
    b.evolution_instance != null &&
    typeof b.evolution_instance !== "string"
  ) {
    return { ok: false, error: "evolution_instance must be string or null" };
  }
  if (b.http_status != null && typeof b.http_status !== "number") {
    return { ok: false, error: "http_status must be number or null" };
  }

  return {
    ok: true,
    payload: {
      place_id: b.place_id,
      channel: b.channel,
      error: b.error,
      error_code: typeof b.error_code === "string" ? b.error_code : null,
      evolution_instance:
        typeof b.evolution_instance === "string" ? b.evolution_instance : null,
      http_status: typeof b.http_status === "number" ? b.http_status : null,
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

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // Compose the short error blurb stored on the lead. Kept under 500 chars
  // because existing UI surfaces this inline and long blobs break layout.
  const outreachError = `${payload.error_code ?? "error"}: ${payload.error}`.slice(
    0,
    500,
  );

  // Intentionally NOT: touching status, setting outreach_sent, or inserting
  // a conversation row. A failed send didn't reach the prospect and must
  // remain retryable on the next bot pass.
  const update: Record<string, unknown> = {
    outreach_error: outreachError,
    status_updated_at: now,
  };
  if (payload.evolution_instance) {
    update.evolution_instance = payload.evolution_instance;
  }

  await supabase
    .from("leads")
    .update(update)
    .eq("place_id", payload.place_id);

  console.log(
    "[bot-outreach:failed] place_id=",
    payload.place_id,
    "channel=",
    payload.channel,
    "error_code=",
    payload.error_code ?? "(none)",
    "http_status=",
    payload.http_status ?? "(none)",
    "error=",
    payload.error.slice(0, 200),
  );

  return Response.json({ ok: true });
}
