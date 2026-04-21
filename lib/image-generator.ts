import { createServiceClient } from "@/lib/supabase/service";
import type { GeneratedImages, ModelTier } from "@/lib/types";

const GETIMG_URL = "https://api.getimg.ai/v2/images/generations";
const BUCKET = "site-images";

type AspectRatio = "16:9" | "1:1";

const MODEL_BY_TIER: Record<ModelTier, string> = {
  fast: "z-image-turbo",
  balanced: "seedream-4-5",
  premium: "gemini-3-1-flash-image",
};

function resolveModel(tier: ModelTier | undefined): string {
  if (tier && MODEL_BY_TIER[tier]) return MODEL_BY_TIER[tier];
  return MODEL_BY_TIER.balanced;
}

async function callGetimg(
  prompt: string,
  aspectRatio: AspectRatio,
  model: string,
): Promise<ArrayBuffer | null> {
  const apiKey = process.env.GETIMG_API_KEY;
  if (!apiKey) {
    console.error(
      "[image-generator] GETIMG_API_KEY not set — skipping generation",
    );
    return null;
  }

  try {
    const res = await fetch(GETIMG_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        aspect_ratio: aspectRatio,
        resolution: "2K",
        output_format: "webp",
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        "[image-generator] Getimg error",
        res.status,
        model,
        text.slice(0, 500),
      );
      return null;
    }

    const data = (await res.json()) as { data?: Array<{ url?: string }> };
    const url = data.data?.[0]?.url;
    if (!url) {
      console.error("[image-generator] Getimg response missing url field");
      return null;
    }

    const imgRes = await fetch(url);
    if (!imgRes.ok) {
      console.error(
        "[image-generator] Failed to download bytes",
        imgRes.status,
      );
      return null;
    }
    return await imgRes.arrayBuffer();
  } catch (err) {
    console.error("[image-generator] Getimg call threw", err);
    return null;
  }
}

async function uploadToSupabase(
  bytes: ArrayBuffer,
  path: string,
): Promise<string | null> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, new Uint8Array(bytes), {
        contentType: "image/webp",
        upsert: true,
      });
    if (error) {
      console.error(
        "[image-generator] Supabase upload failed",
        path,
        error.message,
      );
      return null;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error("[image-generator] Supabase upload threw", path, err);
    return null;
  }
}

async function generateOne(
  prompt: string,
  aspectRatio: AspectRatio,
  model: string,
  path: string,
): Promise<string | null> {
  const bytes = await callGetimg(prompt, aspectRatio, model);
  if (!bytes) return null;
  return uploadToSupabase(bytes, path);
}

export async function generateSiteImages(params: {
  projectId: string;
  heroPrompt: string;
  heroModelTier: ModelTier;
  services: Array<{ name: string; imagePrompt: string; modelTier: ModelTier }>;
}): Promise<GeneratedImages | null> {
  const { projectId, heroPrompt, heroModelTier, services } = params;

  if (!projectId || !heroPrompt?.trim()) {
    console.warn(
      "[image-generator] missing projectId or heroPrompt — skipping",
    );
    return null;
  }

  const heroTask = generateOne(
    heroPrompt,
    "16:9",
    resolveModel(heroModelTier),
    `${projectId}/hero.webp`,
  );

  const serviceTasks = services.map((svc, idx) => {
    if (!svc.imagePrompt?.trim() || !svc.name?.trim()) {
      return Promise.resolve(null);
    }
    return generateOne(
      svc.imagePrompt,
      "1:1",
      resolveModel(svc.modelTier),
      `${projectId}/service-${idx + 1}.webp`,
    ).then((url) => (url ? { name: svc.name, url } : null));
  });

  const [heroUrl, ...serviceResults] = await Promise.all([
    heroTask,
    ...serviceTasks,
  ]);

  if (!heroUrl) {
    console.warn(
      "[image-generator] hero failed — returning null (Claude Code will fall back to placeholders)",
    );
    return null;
  }

  const successfulServices = serviceResults.filter(
    (s): s is { name: string; url: string } => s !== null,
  );

  return {
    hero: heroUrl,
    services: successfulServices,
  };
}
