import { NextRequest } from "next/server";
import { verifyBotAuth } from "@/lib/auth/bot-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getRecentConversations } from "@/lib/supabase/queries";
import { generateClaudeCodePrompt } from "@/lib/ai-workflow";
import type { Conversation, Lead, Project } from "@/lib/types";

// Generating the Claude Code prompt + images takes 30–90s for the Opus path.
// Vercel Pro needed for maxDuration up to 300s.
export const maxDuration = 300;

/**
 * Bot-authenticated Project creation + prompt/image generation.
 *
 * Called by the prospect-bot at the end of the US-WhatsApp auto-mode pipeline.
 * The bot has already collected, analyzed, and scored the lead — this
 * endpoint creates the Project row and seeds it with the Claude Code
 * prompt + generated images so Levi can run Claude Code locally and paste
 * the preview URL back.
 *
 * Does NOT dispatch any outreach message — that happens only after Levi
 * pastes the preview URL (POST /api/projects/[place_id]/dispatch-preview).
 *
 * Idempotent-ish: if a project already exists for the lead, returns 409 so
 * the bot can skip without duplicating work.
 */
export async function POST(request: NextRequest) {
  const auth = verifyBotAuth(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const place_id = typeof body?.place_id === "string" ? body.place_id.trim() : "";
  if (!place_id) {
    return Response.json({ error: "place_id is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("*")
    .eq("place_id", place_id)
    .maybeSingle();

  if (leadErr) {
    return Response.json({ error: leadErr.message }, { status: 500 });
  }
  if (!lead) {
    return Response.json({ error: "lead_not_found" }, { status: 404 });
  }

  const { data: existing, error: existingErr } = await supabase
    .from("projects")
    .select("id, claude_code_prompt")
    .eq("place_id", place_id)
    .maybeSingle();

  if (existingErr) {
    return Response.json({ error: existingErr.message }, { status: 500 });
  }
  if (existing) {
    return Response.json(
      { ok: true, project_id: existing.id, already_existed: true },
      { status: 200 },
    );
  }

  const { data: project, error: insertErr } = await supabase
    .from("projects")
    .insert({
      place_id,
      status: "approved",
      approved_at: new Date().toISOString(),
      scope: null,
    })
    .select()
    .single();

  if (insertErr || !project) {
    return Response.json(
      { error: insertErr?.message ?? "project_insert_failed" },
      { status: 500 },
    );
  }

  const convs = await getRecentConversations(supabase, place_id, 20);

  try {
    await generateClaudeCodePrompt(
      lead as Lead,
      project as Project,
      convs as Conversation[],
    );
  } catch (err) {
    // Project row is already in the DB — a failure here just means the
    // prompt/images didn't get generated. Levi can regenerate manually from
    // the lead detail UI. Log loudly so it's visible in Vercel logs.
    console.error(
      "[bot/project/create] generateClaudeCodePrompt failed for",
      place_id,
      err,
    );
  }

  return Response.json(
    { ok: true, project_id: project.id, already_existed: false },
    { status: 201 },
  );
}
