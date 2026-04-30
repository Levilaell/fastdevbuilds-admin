import { NextRequest } from "next/server";
import { getAuthUser, unauthorizedResponse } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  Experiment,
  ExperimentVariant,
  ExperimentQualificationFilters,
} from "@/lib/types";

/**
 * GET /api/experiments — list all experiments (most recent first).
 */
export async function GET() {
  if (!(await getAuthUser())) return unauthorizedResponse();

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("experiments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ experiments: (data ?? []) as Experiment[] });
}

interface CreateVariantInput {
  name: string;
  niches: string[];
  cities: string[];
  message_template: string;
  target_volume?: number;
  qualification_filters?: ExperimentQualificationFilters;
}

interface CreateExperimentBody {
  name: string;
  hypothesis?: string;
  variants: CreateVariantInput[];
}

/**
 * POST /api/experiments — create experiment + variants atomically.
 * Body: { name, hypothesis?, variants: [{ name, niches, cities, message_template, target_volume?, qualification_filters? }] }
 *
 * Variants é obrigatório (>=1). Sem variant não há experimento — todo lead
 * stamping depende disso.
 */
export async function POST(request: NextRequest) {
  if (!(await getAuthUser())) return unauthorizedResponse();

  let body: CreateExperimentBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string") {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  if (!Array.isArray(body.variants) || body.variants.length === 0) {
    return Response.json({ error: "at least one variant required" }, { status: 400 });
  }

  for (const v of body.variants) {
    if (!v.name || !v.message_template) {
      return Response.json(
        { error: "each variant requires name and message_template" },
        { status: 400 },
      );
    }
  }

  const supabase = createServiceClient();

  const { data: experiment, error: expErr } = await supabase
    .from("experiments")
    .insert({
      name: body.name.trim(),
      hypothesis: body.hypothesis?.trim() || null,
      status: "draft",
    })
    .select()
    .single();

  if (expErr || !experiment) {
    return Response.json(
      { error: expErr?.message ?? "experiment_insert_failed" },
      { status: 500 },
    );
  }

  const variantsPayload = body.variants.map((v) => ({
    experiment_id: experiment.id,
    name: v.name.trim(),
    niches: v.niches ?? [],
    cities: v.cities ?? [],
    message_template: v.message_template,
    target_volume: v.target_volume ?? 30,
    qualification_filters: v.qualification_filters ?? null,
  }));

  const { data: variants, error: varErr } = await supabase
    .from("experiment_variants")
    .insert(variantsPayload)
    .select();

  if (varErr) {
    // Rollback the parent — keeping experiments without variants would
    // leak orphans into the UI list.
    await supabase.from("experiments").delete().eq("id", experiment.id);
    return Response.json({ error: varErr.message }, { status: 500 });
  }

  return Response.json(
    {
      experiment: experiment as Experiment,
      variants: (variants ?? []) as ExperimentVariant[],
    },
    { status: 201 },
  );
}
