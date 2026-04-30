import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser, unauthorizedResponse } from "@/lib/supabase/auth";
import { dispatchMessage } from "@/lib/messages/dispatch";

export async function POST(request: NextRequest) {
  if (!(await getAuthUser())) return unauthorizedResponse();

  const body = await request.json();
  const { place_id, message, subject } = body as {
    place_id: string;
    message: string;
    subject?: string;
  };

  if (!place_id || !message) {
    return Response.json(
      { error: "place_id and message are required" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("phone, evolution_instance, whatsapp_jid")
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
    subject,
    lead: {
      phone: lead.phone,
      evolution_instance: lead.evolution_instance,
      whatsapp_jid: lead.whatsapp_jid,
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
