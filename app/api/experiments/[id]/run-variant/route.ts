import { NextRequest } from "next/server";
import { getAuthUser, unauthorizedResponse } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getInstances } from "@/lib/whatsapp";
import type { Experiment, ExperimentVariant } from "@/lib/types";

interface RunVariantBody {
  variant_id: string;
  limit?: number;
  send?: boolean;
  dry_run?: boolean;
  per_instance_send?: Record<string, number>;
}

/**
 * POST /api/experiments/[id]/run-variant — dispatch a bot run scoped to one
 * variant of the experiment. The bot stamps each lead with experiment_id +
 * experiment_variant_id so the dashboard can compute per-variant metrics.
 *
 * Caller is expected to have already started the experiment (status=running).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getAuthUser())) return unauthorizedResponse();

  const { id: experimentId } = await params;
  let body: RunVariantBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.variant_id) {
    return Response.json({ error: "variant_id is required" }, { status: 400 });
  }

  const botUrl = process.env.BOT_SERVER_URL;
  if (!botUrl) {
    return Response.json(
      { error: "BOT_SERVER_URL não está configurado" },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();

  const [expRes, varRes] = await Promise.all([
    supabase.from("experiments").select("*").eq("id", experimentId).maybeSingle(),
    supabase
      .from("experiment_variants")
      .select("*")
      .eq("id", body.variant_id)
      .eq("experiment_id", experimentId)
      .maybeSingle(),
  ]);

  if (!expRes.data) {
    return Response.json({ error: "experiment_not_found" }, { status: 404 });
  }
  if (!varRes.data) {
    return Response.json({ error: "variant_not_found" }, { status: 404 });
  }

  const experiment = expRes.data as Experiment;
  const variant = varRes.data as ExperimentVariant;

  if (experiment.status !== "running") {
    return Response.json(
      {
        error: `experiment is ${experiment.status}, must be running to dispatch a variant`,
      },
      { status: 400 },
    );
  }

  if (variant.niches.length === 0 || variant.cities.length === 0) {
    return Response.json(
      { error: "variant has empty niches or cities" },
      { status: 400 },
    );
  }

  // Validate per_instance_send (mirror /api/bot/run-auto)
  const instances = getInstances();
  const knownNames = new Set(instances.map((i) => i.name));
  if (body.per_instance_send) {
    for (const [name, val] of Object.entries(body.per_instance_send)) {
      if (!knownNames.has(name)) {
        return Response.json(
          { error: `per_instance_send: unknown instance '${name}'` },
          { status: 400 },
        );
      }
      if (!Number.isInteger(val) || val < 0) {
        return Response.json(
          { error: `per_instance_send: '${name}' must be non-negative int` },
          { status: 400 },
        );
      }
    }
  }

  // Create bot_run record stamped with the variant's campaign_code.
  // campaign_code = `exp_<expId>_v_<varId>` for backward compat with metrics
  // queries that expect a campaign string.
  const campaignCode = `exp_${experiment.id.slice(0, 8)}_v_${variant.id.slice(0, 8)}`;
  const { data: run } = await supabase
    .from("bot_runs")
    .insert({ status: "running", campaign_code: campaignCode })
    .select("id")
    .single();

  const evolutionInstances = instances.map((i) => ({
    name: i.name,
    apiKey: i.apiKey,
    ...(body.per_instance_send && body.per_instance_send[i.name] !== undefined
      ? { maxThisRun: body.per_instance_send[i.name] }
      : {}),
  }));

  try {
    const botResponse = await fetch(`${botUrl}/run-auto`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.BOT_SERVER_SECRET ?? ""}`,
      },
      body: JSON.stringify({
        limit: body.limit ?? 30,
        min_score: 0,
        dry_run: body.dry_run ?? false,
        send: body.send ?? false,
        market: "BR",
        max_send: variant.target_volume,
        campaign_code: campaignCode,
        bot_run_id: run?.id ?? null,
        // Lab-specific stamping — bot.lib/supabase setExperimentContext picks
        // these up and applies them to every upserted lead.
        experiment_id: experiment.id,
        experiment_variant_id: variant.id,
        // Variant-driven config (replaces bot-config.ts defaults for this run)
        niches: variant.niches,
        cities: variant.cities,
        lang: "pt",
        country: "BR",
        channel: "whatsapp",
        ...(variant.qualification_filters
          ? { qualificationFilters: variant.qualification_filters }
          : {}),
        evolutionInstances,
        evolutionApiUrl: process.env.EVOLUTION_API_URL,
      }),
    });

    if (!botResponse.ok) {
      const errText = await botResponse
        .text()
        .catch(() => String(botResponse.status));
      if (run?.id) {
        await supabase
          .from("bot_runs")
          .update({ status: "failed", finished_at: new Date().toISOString() })
          .eq("id", run.id);
      }
      return Response.json(
        { error: `Bot server: ${errText}` },
        { status: botResponse.status },
      );
    }

    const data = await botResponse.json();

    if (run?.id && data.runId) {
      await supabase
        .from("bot_runs")
        .update({ server_run_id: data.runId })
        .eq("id", run.id);
    }

    return Response.json({
      botRunId: run?.id,
      serverRunId: data.runId,
      variant_id: variant.id,
      campaign_code: campaignCode,
    });
  } catch (err) {
    if (run?.id) {
      await supabase
        .from("bot_runs")
        .update({ status: "failed", finished_at: new Date().toISOString() })
        .eq("id", run.id);
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "Erro" },
      { status: 502 },
    );
  }
}
