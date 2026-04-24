import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser, unauthorizedResponse } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { dispatchMessage } from "@/lib/messages/dispatch";
import {
  PREVIEW_FIRST_OUTREACH_SYSTEM_PROMPT_EN,
  buildPreviewFirstOutreachUserPrompt,
} from "@/lib/prompts";
import { SCORE_REASON_LABELS, type Lead } from "@/lib/types";

// Claude Sonnet generation (fast) + WhatsApp send. Keep headroom for Evolution
// latency spikes — 60s was the old hang limit before the dedicated dispatch.
export const maxDuration = 120;

/**
 * Persist the Vercel preview URL pasted by Levi, compose the initial cold
 * outreach message with that URL embedded, and dispatch it via WhatsApp.
 *
 * This is the "send" step of the US-WhatsApp preview-first flow. Until this
 * is called, the lead hasn't received any outbound message — the Project is
 * sitting in the "Prompt pronto" kanban column waiting for Levi to run
 * Claude Code locally and paste the URL.
 *
 * After success:
 *   - projects.preview_url populated
 *   - projects.preview_sent_at populated
 *   - projects.status = 'preview_sent'
 *   - one outbound conversation row written (by dispatchMessage)
 *   - leads.status transitions per recordOutboundMessage rules
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

  // Optional override: force a specific Evolution instance for this lead.
  // When set, we pin the lead to that instance before dispatch so
  // getOrAssignInstance reuses it (instead of picking least-used globally).
  const evolutionInstanceOverride =
    typeof body?.evolution_instance === "string" && body.evolution_instance.trim()
      ? body.evolution_instance.trim()
      : null;

  // Basic URL sanity — avoid dispatching a malformed link that WhatsApp won't
  // render as a clickable preview.
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

  // Only intended for the US-WhatsApp preview-first flow. BR has its own
  // existing flow and US-email goes through Instantly.
  if (lead.country !== "US" || lead.outreach_channel === "email") {
    return Response.json(
      {
        error:
          "dispatch-preview is only supported for US WhatsApp leads (country=US, channel=whatsapp)",
      },
      { status: 400 },
    );
  }

  // Save the URL first so even a send failure leaves the UI showing "URL
  // saved, retry send" instead of losing Levi's paste.
  await supabase
    .from("projects")
    .update({ preview_url: previewUrl })
    .eq("id", project.id);

  // Pin the chosen instance on the lead so dispatchMessage reuses it via
  // getOrAssignInstance. Validates the name against the configured pool
  // so a bogus value doesn't silently send from a default fallback.
  if (evolutionInstanceOverride) {
    const { getInstances } = await import("@/lib/whatsapp");
    const known = getInstances().some((i) => i.name === evolutionInstanceOverride);
    if (!known) {
      return Response.json(
        {
          error: `evolution_instance '${evolutionInstanceOverride}' is not configured`,
        },
        { status: 400 },
      );
    }
    await supabase
      .from("leads")
      .update({ evolution_instance: evolutionInstanceOverride })
      .eq("place_id", place_id);
    lead.evolution_instance = evolutionInstanceOverride;
  }

  // Compose cold outreach message with the URL embedded.
  const reasonsText = (lead.score_reasons ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => SCORE_REASON_LABELS[r] ?? r)
    .join(", ");

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
          previewUrl,
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

  // Safety net: Claude sometimes drops the URL (hallucinates shortened form or
  // paraphrases). If the URL isn't verbatim in the message, append it on its
  // own line so the link-preview still renders.
  const messageWithUrl = message.includes(previewUrl)
    ? message
    : `${message}\n\n${previewUrl}`;

  const dispatchResult = await dispatchMessage({
    supabase,
    place_id,
    message: messageWithUrl,
    channel: "whatsapp",
    suggestedByAi: true,
    lead: {
      phone: lead.phone,
      email: lead.email,
      evolution_instance: lead.evolution_instance,
      whatsapp_jid: lead.whatsapp_jid,
      country: lead.country,
    },
  });

  if (!dispatchResult.ok) {
    // URL is saved, send failed — UI lets Levi retry.
    return Response.json(
      { error: dispatchResult.error, detail: dispatchResult.detail ?? null },
      { status: dispatchResult.httpStatus },
    );
  }

  const now = new Date().toISOString();
  await supabase
    .from("projects")
    .update({
      preview_sent_at: now,
      status: "preview_sent",
    })
    .eq("id", project.id);

  return Response.json({
    ok: true,
    message: messageWithUrl,
    conversation: dispatchResult.conversation,
    preview_sent_at: now,
  });
}
