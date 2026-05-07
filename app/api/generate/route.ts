import { NextResponse } from "next/server";
import { getGemini, splitDataUrl, IMAGE_MODEL } from "@/lib/gemini";
import type { AspectRatio, GenerateRequest, GenerateResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function aspectInstruction(ratio?: AspectRatio): string {
  switch (ratio) {
    case "1:1":
      return " IMPORTANT: render as a SQUARE 1:1 image suitable for an Instagram feed post. Compose for a square frame.";
    case "9:16":
      return " IMPORTANT: render as a TALL VERTICAL 9:16 image suitable for an Instagram Story or Reel. Compose for a tall vertical frame.";
    case "4:5":
      return " IMPORTANT: render as a 4:5 PORTRAIT image suitable for an Instagram feed post or Reel cover. Compose for a portrait frame.";
    default:
      return "";
  }
}

async function generateOne(
  baseImage: string,
  prompt: string,
  aspectRatio?: AspectRatio
): Promise<{ image: string | null; error: string | null }> {
  try {
    const ai = getGemini();
    const { mimeType, data } = splitDataUrl(baseImage);
    const finalPrompt = prompt + aspectInstruction(aspectRatio);
    const result = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data } },
            { text: finalPrompt },
          ],
        },
      ],
    });

    const parts = result.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      const inline = (p as { inlineData?: { mimeType?: string; data?: string } })
        .inlineData;
      if (inline?.data) {
        const mt = inline.mimeType || "image/png";
        return { image: `data:${mt};base64,${inline.data}`, error: null };
      }
    }
    return { image: null, error: "No image returned" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return { image: null, error: message };
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateRequest;
    if (!body.baseImage) {
      return NextResponse.json({ error: "Missing baseImage" }, { status: 400 });
    }
    if (!Array.isArray(body.prompts) || body.prompts.length === 0) {
      return NextResponse.json({ error: "Missing prompts" }, { status: 400 });
    }
    const N = Math.min(body.prompts.length, 4);
    const prompts = body.prompts.slice(0, N);
    const ratios = (body.aspectRatios ?? []).slice(0, N);

    const results = await Promise.all(
      prompts.map((p, i) => generateOne(body.baseImage, p, ratios[i]))
    );

    const response: GenerateResponse = {
      images: results.map((r) => r.image),
      errors: results.map((r) => r.error),
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("/api/generate error", err);
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
