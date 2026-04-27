import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser, unauthorizedResponse } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  PREVIEW_FIRST_OUTREACH_SYSTEM_PROMPT_EN,
  buildPreviewFirstOutreachUserPrompt,
} from "@/lib/prompts";
import { withViewMarker } from "@/lib/preview-tracking";
import { SCORE_REASON_LABELS, type Lead } from "@/lib/types";

export const maxDuration = 60;

/**
 * Compose-only sibling of dispatch-preview: generates the cold outreach
 * message with the URL embedded and persists preview_url, but does NOT send
 * via Evolution and does NOT mark the project as sent.
 *
 * Used by the manual-send flow (Levi sends from his phone): UI calls this to
 * grab the message text, copies it to clipboard, and later calls
 * mark-preview-sent to record the outbound row.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  if (!(await getAuthUser())) return unauthorizedResponse();

  const { place_id } = await params;
  if (!place_id) {
    return Response.json({ error: "place_id is required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const previewUrl =
    typeof body?.preview_url === "string" && body.preview_url.trim()
      ? body.preview_url.trim()
      : null;

  if (!previewUrl) {
    return Response.json({ error: "preview_url is required" }, { status: 400 });
  }

  try {
    const u = new URL(previewUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("non-http protocol");
    }
  } catch {
    return Response.json(
      { error: "preview_url must be a valid http(s) URL" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const [leadRes, projectRes] = await Promise.all([
    supabase.from("leads").select("*").eq("place_id", place_id).maybeSingle(),
    supabase.from("projects").select("*").eq("place_id", place_id).maybeSingle(),
  ]);

  if (leadRes.error) {
    return Response.json({ error: leadRes.error.message }, { status: 500 });
  }
  if (projectRes.error) {
    return Response.json({ error: projectRes.error.message }, { status: 500 });
  }
  if (!leadRes.data) {
    return Response.json({ error: "lead_not_found" }, { status: 404 });
  }
  if (!projectRes.data) {
    return Response.json({ error: "project_not_found" }, { status: 404 });
  }

  const lead = leadRes.data as Lead;
  const project = projectRes.data;

  if (lead.country !== "US" || lead.outreach_channel === "email") {
    return Response.json(
      {
        error:
          "compose-preview is only supported for US WhatsApp leads (country=US, channel=whatsapp)",
      },
      { status: 400 },
    );
  }

  await supabase
    .from("projects")
    .update({ preview_url: previewUrl })
    .eq("id", project.id);

  const reasonsText = (lead.score_reasons ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => SCORE_REASON_LABELS[r] ?? r)
    .join(", ");

  const trackedUrl = withViewMarker(previewUrl, place_id);

  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system: PREVIEW_FIRST_OUTREACH_SYSTEM_PROMPT_EN,
    messages: [
      {
        role: "user",
        content: buildPreviewFirstOutreachUserPrompt(
          lead,
          reasonsText,
          trackedUrl,
        ),
      },
    ],
  });

  const message =
    response.content[0]?.type === "text"
      ? response.content[0].text.trim()
      : "";

  if (!message) {
    return Response.json(
      { error: "AI returned empty message" },
      { status: 502 },
    );
  }

  const messageWithUrl = message.includes(trackedUrl)
    ? message
    : `${message}\n\n${trackedUrl}`;

  return Response.json({
    ok: true,
    message: messageWithUrl,
    preview_url: previewUrl,
  });
}
