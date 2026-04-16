import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser, unauthorizedResponse } from "@/lib/supabase/auth";
import {
  sendWhatsApp,
  getOrAssignInstance,
  isValidPhone,
  resolvePhoneFromLid,
  getInstances,
} from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  if (!(await getAuthUser())) return unauthorizedResponse();

  const body = await request.json();
  const { place_id, message, channel, subject } = body as {
    place_id: string;
    message: string;
    channel: "whatsapp" | "email";
    subject?: string;
  };

  if (!place_id || !message || !channel) {
    return Response.json(
      { error: "place_id, message, and channel are required" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("phone, email, evolution_instance, whatsapp_jid")
    .eq("place_id", place_id)
    .maybeSingle();

  if (leadError) {
    return Response.json({ error: leadError.message }, { status: 500 });
  }

  if (!lead) {
    return Response.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  const now = new Date().toISOString();

  if (channel === "whatsapp") {
    let phone = lead.phone?.trim() || null;

    // Fallback 1: extract phone from place_id for unknown inbound leads
    if (!phone && place_id.startsWith("unknown_")) {
      const candidate = place_id.replace("unknown_", "");
      if (/^55\d{10,11}$/.test(candidate)) {
        phone = candidate;
      }
    }

    // Fallback 2: extract phone from whatsapp_jid
    if (!phone && lead.whatsapp_jid) {
      const jid = lead.whatsapp_jid as string;

      if (jid.endsWith("@s.whatsapp.net")) {
        const candidate = jid.split("@")[0].replace(/\D/g, "");
        if (isValidPhone(candidate)) {
          phone = candidate;
        }
      } else if (jid.endsWith("@lid")) {
        const lidValue = jid.split("@")[0];
        const instName = lead.evolution_instance as string | undefined;
        const inst = instName
          ? getInstances().find((i) => i.name === instName)
          : undefined;

        const resolved = await resolvePhoneFromLid(
          lidValue,
          inst?.name,
          inst?.apiKey,
        );

        if (resolved && isValidPhone(resolved)) {
          phone = resolved;
        }
      }
    }

    if (phone && !lead.phone) {
      await supabase.from("leads").update({ phone }).eq("place_id", place_id);
    }

    if (!phone) {
      return Response.json(
        { error: "Lead não tem telefone cadastrado" },
        { status: 400 },
      );
    }

    const instance = await getOrAssignInstance(supabase, place_id);
    const result = await sendWhatsApp(phone, message, instance?.name);

    if (!result.ok) {
      console.error("[send] whatsapp failed:", result);

      await supabase
        .from("leads")
        .update({
          outreach_error: JSON.stringify(result).slice(0, 1000),
          status_updated_at: now,
        })
        .eq("place_id", place_id);

      return Response.json(
        { error: "Falha ao enviar WhatsApp", detail: result },
        { status: 502 },
      );
    }
  }

  if (channel === "email") {
    const email = lead.email?.trim();
    if (!email) {
      return Response.json(
        { error: "Lead has no email address" },
        { status: 400 },
      );
    }

    const apiKey = process.env.INSTANTLY_API_KEY;
    const campaignId = process.env.INSTANTLY_CAMPAIGN_ID;
    if (!apiKey || !campaignId) {
      return Response.json(
        { error: "Instantly not configured (missing API key or campaign ID)" },
        { status: 501 },
      );
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
              email,
              custom_variables: {
                message,
                email_subject: subject ?? "Re: Your website",
              },
            },
          ],
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => String(res.status));
        console.error("[send] Instantly email failed:", errText);

        await supabase
          .from("leads")
          .update({
            outreach_error: errText.slice(0, 1000),
            status_updated_at: now,
          })
          .eq("place_id", place_id);

        return Response.json(
          { error: `Email send failed: ${errText}` },
          { status: 502 },
        );
      }
    } catch (err) {
      console.error("[send] Instantly email error:", err);

      await supabase
        .from("leads")
        .update({
          outreach_error:
            err instanceof Error
              ? err.message.slice(0, 1000)
              : "unknown email error",
          status_updated_at: now,
        })
        .eq("place_id", place_id);

      return Response.json(
        { error: "Failed to send email via Instantly" },
        { status: 502 },
      );
    }
  }

  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .insert({
      place_id,
      direction: "out",
      channel,
      message,
      subject: channel === "email" ? subject || null : null,
      sent_at: now,
      suggested_by_ai: false,
    })
    .select()
    .single();

  if (convError) {
    return Response.json({ error: convError.message }, { status: 500 });
  }

  await supabase
    .from("ai_suggestions")
    .update({ status: "rejected" })
    .eq("place_id", place_id)
    .eq("status", "pending");

  const { data: leadCheck } = await supabase
    .from("leads")
    .select("status")
    .eq("place_id", place_id)
    .maybeSingle();

  if (leadCheck?.status === "prospected") {
    await supabase
      .from("leads")
      .update({
        status: "sent",
        outreach_sent: true,
        outreach_sent_at: now,
        outreach_channel: channel,
        status_updated_at: now,
        last_outbound_at: now,
        outreach_error: null,
      })
      .eq("place_id", place_id);
  } else if (leadCheck?.status === "replied") {
    await supabase
      .from("leads")
      .update({
        status: "negotiating",
        status_updated_at: now,
        last_outbound_at: now,
        outreach_error: null,
      })
      .eq("place_id", place_id);
  } else {
    await supabase
      .from("leads")
      .update({
        last_outbound_at: now,
        outreach_error: null,
      })
      .eq("place_id", place_id);
  }

  return Response.json(conv);
}
