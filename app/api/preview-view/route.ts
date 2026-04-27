import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Public ingest for preview view beacons. Called via navigator.sendBeacon from
// public/track.js embedded in every Vercel preview we ship. Beacons fire only
// when the URL carries ?v={place_id}, so the admin opening a raw preview to
// QA does not log a view.
//
// Auth: none. The preview HTML lives on a different *.vercel.app subdomain
// than this admin, so locking to a session is impossible. We instead validate
// that the incoming place_id corresponds to a project whose preview was
// already dispatched (preview_sent_at IS NOT NULL) — keeps random place_ids
// from being injected before we've actually sent anything.

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  // sendBeacon ships the body as a Blob with type text/plain to dodge the
  // CORS preflight, so we read raw text and parse JSON ourselves instead of
  // relying on request.json().
  let placeId: string | null = null;
  let referrer: string | null = null;
  try {
    const raw = await request.text();
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.place_id === "string" && parsed.place_id.trim()) {
        placeId = parsed.place_id.trim();
      }
      if (typeof parsed?.referrer === "string" && parsed.referrer.trim()) {
        referrer = parsed.referrer.trim().slice(0, 500);
      }
    }
  } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!placeId) {
    return new Response(JSON.stringify({ error: "place_id_required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createServiceClient();

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("place_id, preview_sent_at")
    .eq("place_id", placeId)
    .maybeSingle();

  if (projectErr) {
    return new Response(JSON.stringify({ error: projectErr.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  if (!project || !project.preview_sent_at) {
    // Either bogus place_id or preview hasn't been dispatched yet — drop
    // silently with 204 so a script error in the wild can't be probed.
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor
    ? forwardedFor.split(",")[0]?.trim().slice(0, 64) ?? null
    : request.headers.get("x-real-ip")?.slice(0, 64) ?? null;

  await supabase.from("preview_views").insert({
    place_id: placeId,
    user_agent: userAgent,
    ip,
    referrer,
  });

  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
