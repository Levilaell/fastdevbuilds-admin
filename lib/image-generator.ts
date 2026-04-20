import { createServiceClient } from "@/lib/supabase/service";
import type { GeneratedImages } from "@/lib/types";

const GETIMG_URL = "https://api.getimg.ai/v2/images/generations";
const BUCKET = "site-images";

type AspectRatio = "16:9" | "1:1";

function heroPrompt(palette: string): string {
  return `Abstract watercolor painting, soft organic shapes, ${palette}, minimalist composition, ample negative space, subtle texture, professional, calming, no faces, no objects, no text`;
}

function servicePrompt(service: string, palette: string): string {
  return `Abstract ink wash painting, ${palette} color scheme, inspired by ${service}, minimalist organic shapes, watercolor texture, professional branding illustration, no faces, no objects, no text, elegant composition`;
}

async function callGetimg(
  prompt: string,
  aspectRatio: AspectRatio,
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
        model: "seedream-5-lite",
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
  path: string,
): Promise<string | null> {
  const bytes = await callGetimg(prompt, aspectRatio);
  if (!bytes) return null;
  return uploadToSupabase(bytes, path);
}

export async function generateSiteImages(params: {
  niche: string;
  palette: string;
  services: string[];
  projectId: string;
}): Promise<GeneratedImages | null> {
  const { palette, services, projectId } = params;

  if (!palette || !projectId) {
    console.warn("[image-generator] missing palette or projectId — skipping");
    return null;
  }

  const heroTask = generateOne(
    heroPrompt(palette),
    "16:9",
    `${projectId}/hero.webp`,
  );
  const serviceTasks = services.map((name, idx) =>
    generateOne(
      servicePrompt(name, palette),
      "1:1",
      `${projectId}/service-${idx + 1}.webp`,
    ).then((url) => (url ? { name, url } : null)),
  );

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
