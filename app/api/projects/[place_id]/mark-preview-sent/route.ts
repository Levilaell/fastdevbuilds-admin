import { NextRequest } from "next/server";
import { getAuthUser, unauthorizedResponse } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { recordOutboundMessage } from "@/lib/messages/record-outbound";
import type { Lead } from "@/lib/types";

export const maxDuration = 30;

/**
 * Manual-send companion to compose-preview. After Levi copies the generated
 * message and sends it from his phone, this endpoint records the outbound
 * conversation row and marks the project as preview_sent — same DB
 * invariants dispatchMessage would have set, minus the Evolution call.
 *
 * Without this, inbound matching for this lead falls back to phone/text-echo
 * with no last_outbound_at anchor, and the kanban doesn't move.
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
  const message =
    typeof body?.message === "string" && body.message.trim()
      ? body.message.trim()
      : null;

  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
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
          "mark-preview-sent is only supported for US WhatsApp leads (country=US, channel=whatsapp)",
      },
      { status: 400 },
    );
  }

  const recorded = await recordOutboundMessage({
    supabase,
    place_id,
    channel: "whatsapp",
    message,
    evolution_instance: lead.evolution_instance ?? null,
    whatsapp_jid: lead.whatsapp_jid ?? null,
    suggested_by_ai: true,
  });

  if (!recorded.ok) {
    return Response.json({ error: recorded.error }, { status: 500 });
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
    preview_sent_at: now,
    idempotent: recorded.idempotent,
  });
}
