import { createClient } from "@supabase/supabase-js";
import { getRecentConversations } from "@/lib/supabase/queries";
import { classifyAndSuggest } from "@/lib/ai-workflow";
import { isAutoReply } from "@/lib/auto-reply";
import { onInboundLeadMessage } from "@/lib/leads/on-inbound";
import type { Lead } from "@/lib/types";

/**
 * Instantly.ai reply webhook.
 *
 * Instantly fires a POST when a prospect replies to a cold email campaign.
 * This endpoint mirrors the WhatsApp webhook flow:
 *   1. Match lead by email
 *   2. Save inbound conversation
 *   3. Auto-advance status (sent → replied) + update inbound tracking fields
 *   4. Fire AI classify + suggest
 */
export async function POST(request: Request) {
  try {
    // Optional auth via shared secret
    const secret = process.env.INSTANTLY_WEBHOOK_SECRET;
    if (secret) {
      const provided =
        request.headers.get("x-webhook-secret") ??
        request.headers.get("authorization")?.replace("Bearer ", "");
      if (provided !== secret) {
        console.warn("[instantly-webhook] rejected — invalid secret");
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json();
    console.log(
      "[instantly-webhook] received:",
      JSON.stringify(body).slice(0, 500),
    );

    // Normalize payload — handle both v1 and v2 formats
    const email: string =
      body.email ??
      body.from_email ??
      body.data?.from_email ??
      body.data?.email ??
      "";
    const replyText: string =
      body.reply_text ??
      body.text ??
      body.data?.body ??
      body.data?.text ??
      "";
    const subject: string = body.subject ?? body.data?.subject ?? "";
    const eventType: string = body.event_type ?? body.event ?? "";

    // Only process reply events
    if (eventType && !eventType.toLowerCase().includes("reply")) {
      console.log(
        "[instantly-webhook] ignoring non-reply event:",
        eventType,
      );
      return Response.json({ ok: true });
    }

    if (!email || !replyText) {
      console.log(
        "[instantly-webhook] missing email or reply text, skipping",
      );
      return Response.json({ ok: true });
    }

    const preview =
      replyText.length > 80 ? replyText.slice(0, 80) + "…" : replyText;
    console.log(`[instantly-webhook] IN email: ${email} — ${preview}`);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );

    // Find lead by email
    const { data: leads } = await supabase
      .from("leads")
      .select("place_id, email, status, business_name")
      .eq("email", email.toLowerCase().trim())
      .limit(1);

    const sentAt = body.timestamp
      ? new Date(body.timestamp).toISOString()
      : new Date().toISOString();

    let placeId: string;
    let leadStatus: string | null = null;

    if (leads && leads.length > 0) {
      placeId = leads[0].place_id;
      leadStatus = leads[0].status;
    } else {
      // Create minimal lead for unknown email sender
      placeId = `unknown_email_${email.replace(/[@.]/g, "_")}`;
      console.log(
        "[instantly-webhook] creating inbound lead for",
        placeId,
      );

      const { error: leadError } = await supabase.from("leads").upsert(
        {
          place_id: placeId,
          business_name: email,
          email: email.toLowerCase().trim(),
          outreach_channel: "email",
          status: "replied",
          country: "US",
          niche: "inbound",
          status_updated_at: new Date().toISOString(),
        },
        { onConflict: "place_id" },
      );

      if (leadError) {
        console.error(
          "[instantly-webhook] failed to upsert inbound lead:",
          leadError.message,
        );
      }
    }

    // Dedup: check for duplicate inbound message
    const { data: dup } = await supabase
      .from("conversations")
      .select("id")
      .eq("place_id", placeId)
      .eq("direction", "in")
      .eq("channel", "email")
      .eq("message", replyText)
      .gte(
        "sent_at",
        new Date(new Date(sentAt).getTime() - 30_000).toISOString(),
      )
      .limit(1);

    if (dup && dup.length > 0) {
      console.log(
        "[instantly-webhook] duplicate message detected, skipping",
      );
      return Response.json({ ok: true });
    }

    // Detect auto-reply
    if (isAutoReply(replyText)) {
      console.log(
        "[instantly-webhook] auto-reply detected for",
        placeId,
      );

      await supabase.from("conversations").insert({
        place_id: placeId,
        direction: "in",
        channel: "email",
        message: replyText,
        subject: subject || null,
        sent_at: sentAt,
        suggested_by_ai: false,
        approved_by: "auto-reply",
      });

      await supabase
        .from("leads")
        .update({
          last_inbound_at: sentAt,
          last_auto_reply_at: sentAt,
        })
        .eq("place_id", placeId);

      return Response.json({ ok: true });
    }

    // Save genuine inbound conversation
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .insert({
        place_id: placeId,
        direction: "in",
        channel: "email",
        message: replyText,
        subject: subject || null,
        sent_at: sentAt,
        suggested_by_ai: false,
      })
      .select("id")
      .single();

    if (convError) {
      console.error(
        "[instantly-webhook] failed to save conversation:",
        convError.message,
      );
    }

    // Update lead state: inbound tracking + sent → replied
    await onInboundLeadMessage(supabase, placeId, sentAt, leadStatus);

    // Fire and forget — AI classify + suggest
    const fullLead = await supabase
      .from("leads")
      .select("*")
      .eq("place_id", placeId)
      .single();

    if (fullLead.data) {
      const history = await getRecentConversations(supabase, placeId, 5);
      console.log(
        "[instantly-webhook] firing classifyAndSuggest for",
        placeId,
      );
      classifyAndSuggest(
        fullLead.data as Lead,
        replyText,
        history,
        conv?.id,
      ).catch((err) => {
        console.error(
          "[instantly-webhook] classify failed:",
          err.message,
        );
      });
    }

    console.log(
      "[instantly-webhook] saved inbound email for lead",
      placeId,
    );
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[instantly-webhook] error:", err);
    return Response.json({ ok: true });
  }
}
