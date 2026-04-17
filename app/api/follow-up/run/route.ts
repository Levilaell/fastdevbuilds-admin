import { createServiceClient } from "@/lib/supabase/service";
import { dispatchMessage } from "@/lib/messages/dispatch";
import { generateFollowUpMessage } from "@/lib/messages/follow-up";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers
    .get("authorization")
    ?.replace("Bearer ", "");
  if (!secret || provided !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: leads, error } = await supabase
    .from("leads")
    .select(
      "place_id, phone, email, evolution_instance, whatsapp_jid, outreach_channel, status, follow_up_count, business_name, score_reasons, visual_score, country",
    )
    .lte("next_follow_up_at", now)
    .eq("follow_up_paused", false)
    .is("last_inbound_at", null)
    .lt("follow_up_count", 2)
    .not("status", "in", "(lost,disqualified)")
    .limit(50);

  if (error) {
    console.error("[follow-up] query error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!leads || leads.length === 0) {
    return Response.json({ ok: true, processed: 0, sent: 0, failed: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (const lead of leads) {
    const count = lead.follow_up_count ?? 0;
    const message = generateFollowUpMessage(lead, count);
    const channel: "whatsapp" | "email" =
      lead.outreach_channel === "email" ? "email" : "whatsapp";

    const result = await dispatchMessage({
      supabase,
      place_id: lead.place_id,
      message,
      channel,
      isFollowUp: true,
      lead: {
        phone: lead.phone,
        email: lead.email,
        evolution_instance: lead.evolution_instance,
        whatsapp_jid: lead.whatsapp_jid,
      },
    });

    if (!result.ok) {
      console.error(
        `[follow-up] failed for ${lead.place_id}:`,
        result.error,
      );
      failed++;

      // Stop retrying for permanent failures
      if (result.httpStatus === 400 || result.httpStatus === 501) {
        await supabase
          .from("leads")
          .update({ next_follow_up_at: null })
          .eq("place_id", lead.place_id);
      }

      continue;
    }

    // Increment count and schedule next (or stop)
    const newCount = count + 1;
    const nextAt =
      newCount < 2
        ? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
        : null;

    await supabase
      .from("leads")
      .update({
        follow_up_count: newCount,
        next_follow_up_at: nextAt,
      })
      .eq("place_id", lead.place_id);

    console.log(
      `[follow-up] sent #${newCount} to ${lead.place_id}, next: ${nextAt ?? "done"}`,
    );
    sent++;
  }

  console.log(
    `[follow-up] complete: ${leads.length} processed, ${sent} sent, ${failed} failed`,
  );
  return Response.json({
    ok: true,
    processed: leads.length,
    sent,
    failed,
  });
}
