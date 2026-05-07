import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 86400;

const EXAMPLES: Record<string, { url: string; prompt: string; title: string }> = {
  "1": {
    title: "Perfume bottle",
    url: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=1024&q=80&fm=jpg",
    prompt: "Lifestyle photo on a marble countertop with morning light",
  },
  "2": {
    title: "Skincare jar",
    url: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=1024&q=80&fm=jpg",
    prompt: "Minimalist editorial shot on pastel sand with soft shadows",
  },
  "3": {
    title: "Sneaker",
    url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1024&q=80&fm=jpg",
    prompt: "Bold summer Instagram ad with neon backdrop and energetic mood",
  },
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "1";
  const ex = EXAMPLES[id];
  if (!ex) return NextResponse.json({ error: "Unknown example" }, { status: 404 });

  try {
    const res = await fetch(ex.url, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "image/jpeg";
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    return NextResponse.json({
      title: ex.title,
      prompt: ex.prompt,
      image: dataUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
