import { NextResponse } from "next/server";
import { getGemini, splitDataUrl, TEXT_MODEL } from "@/lib/gemini";
import type { AnalyzeRequest, AnalyzeResponse, Mode } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are the creative director of an AI product-photo studio.

You receive:
- An image (the current canvas — either a freshly uploaded product photo, or the user's currently selected variant after several rounds of editing).
- The user's natural-language request (e.g. "lifestyle photo on a marble countertop", "make the background warmer", "summer Instagram ad with bold text").
- Optional short conversation history.

You must do five things and return STRICT JSON:
1. productDescription: a 1-sentence factual description of the product visible in the image (what it is, color, key features). Keep it neutral.
2. mode: "edit" if the user is refining the SAME scene already on the canvas (e.g., "make background warmer", "add a border", "more contrast", "remove the text"). "generate" if the user is asking for a clearly NEW scene/composition (e.g., "now show it on a beach", "summer instagram ad", "minimalist product shot on white"). When in doubt prefer "edit" for short tweaks and "generate" for descriptive scene language.
3. label: a 2–5 word title for the sidebar describing this turn (e.g., "Marble countertop", "Warmer tones", "Summer beach ad").
4. variants: an array of EXACTLY 4 production-quality image-generation prompts that interpret the user's request 4 different but plausible ways. Each prompt should be self-contained (3–5 sentences), specify lighting, composition, camera/lens feel, mood, color palette, and any text/typography if relevant. They should clearly preserve the product's identity and key features. Do NOT mention the words "AI", "Gemini", or "prompt" in the prompts. Vary angle, lighting, palette, mood, and surface — but stay on-brief.
5. headlines (CONDITIONAL): IF AND ONLY IF the user's request contains the word "ad", "instagram", "insta", "story", or "reel" (case-insensitive, whole word), include a "headlines" array with EXACTLY 3 short, punchy advertising headline ideas to overlay on the image. Format each as ALL-CAPS phrase followed by an em-dash and a lowercase CTA. Example: "SUMMER GLOW — Shop now". Each ≤ 6 words total. Make them on-brand for the product and the requested vibe. If the request does NOT mention any of those words, OMIT the "headlines" field entirely.

Return ONLY a JSON object matching this TypeScript type:
{
  "productDescription": string,
  "mode": "edit" | "generate",
  "label": string,
  "variants": [string, string, string, string],
  "headlines"?: [string, string, string]
}`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeRequest;
    if (!body.prompt || !body.prompt.trim()) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }
    const canvas = body.baseImage || body.productImage;
    if (!canvas) {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    const ai = getGemini();
    const { mimeType, data } = splitDataUrl(canvas);
    const historyText =
      body.history && body.history.length
        ? "\n\nRecent turns:\n" +
          body.history
            .slice(-6)
            .map((h) => `${h.role}: ${h.text}`)
            .join("\n")
        : "";

    const userTurn = `User request: "${body.prompt.trim()}"${historyText}`;

    const result = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data } },
            { text: userTurn },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        temperature: 1.0,
      },
    });

    const text = result.text ?? "";
    let parsed: AnalyzeResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      // try to extract JSON object
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Model did not return JSON: " + text.slice(0, 200));
      parsed = JSON.parse(m[0]);
    }

    // sanitize
    const mode: Mode = parsed.mode === "generate" ? "generate" : "edit";
    const variants = Array.isArray(parsed.variants)
      ? parsed.variants.filter((v) => typeof v === "string" && v.trim()).slice(0, 4)
      : [];
    while (variants.length < 4) {
      variants.push(body.prompt.trim());
    }

    const adIntent = /\b(ad|ads|instagram|insta|story|stories|reel|reels)\b/i.test(
      body.prompt
    );
    const headlines =
      adIntent && Array.isArray(parsed.headlines)
        ? parsed.headlines
            .filter((h: unknown) => typeof h === "string" && (h as string).trim())
            .slice(0, 3)
        : undefined;

    const out: AnalyzeResponse = {
      productDescription: parsed.productDescription || "Product",
      mode,
      label: (parsed.label || body.prompt.trim()).slice(0, 60),
      variants,
      ...(headlines && headlines.length === 3 ? { headlines } : {}),
    };

    return NextResponse.json(out);
  } catch (err) {
    console.error("/api/analyze error", err);
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
