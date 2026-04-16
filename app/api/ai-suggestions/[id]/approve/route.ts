import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser, unauthorizedResponse } from "@/lib/supabase/auth";
import { dispatchMessage } from "@/lib/messages/dispatch";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getAuthUser())) return unauthorizedResponse();
  const { id } = await params;
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const body = await request.json();
  const editedReply: string | undefined = body.edited_reply;

  const supabase = createServiceClient();

  // Fetch the suggestion
  const { data: suggestion, error } = await supabase
    .from("ai_suggestions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!suggestion) {
    return Response.json({ error: "Suggestion not found" }, { status: 404 });
  }

  const message = editedReply ?? suggestion.suggested_reply;

  // Determine channel from the triggering conversation, or fall back to lead's outreach_channel
  let channel: "whatsapp" | "email" = "whatsapp";
  if (suggestion.conversation_id) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("channel")
      .eq("id", suggestion.conversation_id)
      .maybeSingle();
    if (conv?.channel === "email" || conv?.channel === "whatsapp") {
      channel = conv.channel;
    }
  }

  // Fetch lead contact info
  const { data: lead } = await supabase
    .from("leads")
    .select("phone, email, outreach_channel, evolution_instance, whatsapp_jid")
    .eq("place_id", suggestion.place_id)
    .maybeSingle();

  // Fall back to lead's outreach_channel if conversation didn't determine it
  if (!suggestion.conversation_id && lead?.outreach_channel === "email") {
    channel = "email";
  }

  const result = await dispatchMessage({
    supabase,
    place_id: suggestion.place_id,
    message,
    channel,
    suggestedByAi: true,
    excludeSuggestionId: id,
    lead: {
      phone: lead?.phone ?? null,
      email: lead?.email ?? null,
      evolution_instance: lead?.evolution_instance ?? null,
      whatsapp_jid: lead?.whatsapp_jid ?? null,
    },
  });

  if (!result.ok) {
    return Response.json(
      {
        error: result.error,
        ...(result.detail ? { detail: result.detail } : {}),
      },
      { status: result.httpStatus },
    );
  }

  // Mark this suggestion as sent (approve-specific)
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("ai_suggestions")
    .update({
      status: "sent",
      suggested_reply: message,
      approved_at: now,
      sent_at: now,
    })
    .eq("id", id)
    .eq("status", "pending");

  if (updateError) {
    console.error(
      "[ai-approve] failed to mark suggestion as sent:",
      updateError.message,
    );
  }

  return Response.json({ ok: true, conversation: result.conversation });
}
