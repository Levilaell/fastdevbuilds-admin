import { NextRequest } from "next/server";
import { getAuthUser, unauthorizedResponse } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  Experiment,
  ExperimentVariant,
  ExperimentStatus,
} from "@/lib/types";

interface VariantMetrics {
  variant_id: string;
  variant_name: string;
  collected: number;
  sent: number;
  replied: number;
  preview_sent: number;
  closed: number;
  reply_rate: number;
  close_rate: number;
}

/**
 * GET /api/experiments/[id] — experiment detail + variants + metrics.
 *
 * Metrics aggregated from leads stamped with the variant_id. reply_rate is
 * over `sent`; close_rate is over `replied` (não over total — close rate
 * tradicional é "do que foi respondido, quantos fecharam").
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getAuthUser())) return unauthorizedResponse();

  const { id } = await params;
  const supabase = createServiceClient();

  const [expRes, varRes, leadsRes] = await Promise.all([
    supabase.from("experiments").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("experiment_variants")
      .select("*")
      .eq("experiment_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("leads")
      .select("place_id, experiment_variant_id, status, outreach_sent_at, last_inbound_at")
      .eq("experiment_id", id),
  ]);

  if (expRes.error) {
    return Response.json({ error: expRes.error.message }, { status: 500 });
  }
  if (!expRes.data) {
    return Response.json({ error: "experiment_not_found" }, { status: 404 });
  }

  const experiment = expRes.data as Experiment;
  const variants = (varRes.data ?? []) as ExperimentVariant[];
  const leads = leadsRes.data ?? [];

  const metrics: VariantMetrics[] = variants.map((v) => {
    const variantLeads = leads.filter((l) => l.experiment_variant_id === v.id);
    const collected = variantLeads.length;
    const sent = variantLeads.filter((l) => l.outreach_sent_at).length;
    const replied = variantLeads.filter((l) =>
      ["replied", "negotiating", "closed"].includes(l.status),
    ).length;
    const previewSent = 0; // TODO: derive from projects table after first variant runs
    const closed = variantLeads.filter((l) => l.status === "closed").length;

    return {
      variant_id: v.id,
      variant_name: v.name,
      collected,
      sent,
      replied,
      preview_sent: previewSent,
      closed,
      reply_rate: sent > 0 ? replied / sent : 0,
      close_rate: replied > 0 ? closed / replied : 0,
    };
  });

  return Response.json({ experiment, variants, metrics });
}

/**
 * PATCH /api/experiments/[id] — update status (draft → running → completed|aborted).
 *
 * Transições válidas:
 *   draft → running    (started_at = now)
 *   running → completed (ended_at = now)
 *   running → aborted   (ended_at = now)
 *   * → draft (reset, manual cleanup)
 */
const VALID_TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  draft: ["running"],
  running: ["completed", "aborted"],
  completed: ["draft"],
  aborted: ["draft"],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getAuthUser())) return unauthorizedResponse();

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const newStatus = body?.status as ExperimentStatus | undefined;

  if (!newStatus) {
    return Response.json({ error: "status is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: current } = await supabase
    .from("experiments")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (!current) {
    return Response.json({ error: "experiment_not_found" }, { status: 404 });
  }

  const allowed = VALID_TRANSITIONS[current.status as ExperimentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    return Response.json(
      {
        error: `invalid transition: ${current.status} → ${newStatus}`,
        allowed,
      },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = { status: newStatus };
  const now = new Date().toISOString();
  if (newStatus === "running") patch.started_at = now;
  if (newStatus === "completed" || newStatus === "aborted") patch.ended_at = now;
  if (newStatus === "draft") {
    patch.started_at = null;
    patch.ended_at = null;
  }

  const { data, error } = await supabase
    .from("experiments")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ experiment: data as Experiment });
}

/**
 * DELETE /api/experiments/[id] — cascade-deletes variants + clears leads FKs
 * (experiment_id, experiment_variant_id) via ON DELETE SET NULL.
 *
 * Restrição: só permite deletar `draft` ou `aborted`. Experimentos
 * `running` ou `completed` carregam dados e não devem sumir por engano.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getAuthUser())) return unauthorizedResponse();

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: current } = await supabase
    .from("experiments")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (!current) {
    return Response.json({ error: "experiment_not_found" }, { status: 404 });
  }

  if (!["draft", "aborted"].includes(current.status)) {
    return Response.json(
      { error: "only draft or aborted experiments can be deleted" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("experiments").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
