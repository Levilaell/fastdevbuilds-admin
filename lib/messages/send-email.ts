export type EmailSendResult =
  | { ok: true }
  | { ok: false; reason: string; status?: number; body?: string };

/**
 * Send an outbound email through Instantly's lead-add API.
 */
export async function sendEmail(opts: {
  email: string;
  message: string;
  subject?: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.INSTANTLY_API_KEY;
  const campaignId = process.env.INSTANTLY_CAMPAIGN_ID;

  if (!apiKey || !campaignId) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const res = await fetch("https://api.instantly.ai/api/v1/lead/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        campaign_id: campaignId,
        skip_if_in_workspace: false,
        leads: [
          {
            email: opts.email,
            custom_variables: {
              message: opts.message,
              email_subject: opts.subject ?? "Re: Your website",
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => String(res.status));
      return {
        ok: false,
        reason: "provider_error",
        status: res.status,
        body: errText,
      };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "network_error", body: message };
  }
}
