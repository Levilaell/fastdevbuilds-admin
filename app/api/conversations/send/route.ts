import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser, unauthorizedResponse } from "@/lib/supabase/auth";
import { dispatchMessage } from "@/lib/messages/dispatch";

export async function POST(request: NextRequest) {
  if (!(await getAuthUser())) return unauthorizedResponse();

  const body = await request.json();
  const { place_id, message, channel, subject } = body as {
    place_id: string;
    message: string;
    channel: "whatsapp" | "email" | "sms";
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
    .select("phone, email, evolution_instance, whatsapp_jid, country")
    .eq("place_id", place_id)
    .maybeSingle();

  if (leadError) {
    return Response.json({ error: leadError.message }, { status: 500 });
  }

  if (!lead) {
    return Response.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  const result = await dispatchMessage({
    supabase,
    place_id,
    message,
    channel,
    subject,
    lead: {
      phone: lead.phone,
      email: lead.email,
      evolution_instance: lead.evolution_instance,
      whatsapp_jid: lead.whatsapp_jid,
      country: lead.country,
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

  return Response.json(result.conversation);
}
