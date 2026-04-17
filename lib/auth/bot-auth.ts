export type BotAuthResult =
  | { ok: true }
  | { ok: false; response: Response };

/**
 * Verify an inbound request from the prospect-bot using a shared Bearer
 * secret. Fail-closed: if `BOT_TO_CRM_SECRET` is unset in the environment,
 * every call is rejected with 503 so a misconfigured deploy can't
 * accidentally accept anonymous writes.
 */
export function verifyBotAuth(request: Request): BotAuthResult {
  const secret = process.env.BOT_TO_CRM_SECRET;
  if (!secret) {
    console.error(
      "[bot-auth] BOT_TO_CRM_SECRET is not set — rejecting all bot->CRM calls",
    );
    return {
      ok: false,
      response: Response.json(
        { error: "BOT_TO_CRM_SECRET not configured on server" },
        { status: 503 },
      ),
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";

  if (!provided || provided !== secret) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true };
}
