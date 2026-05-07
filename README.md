# Studio — AI Product Canvas

Upload a product photo, describe a vibe, and Studio turns it into four
production-quality creative variations powered by Gemini 2.5 Flash. Click any
variant to keep iterating — "make the background warmer", "add a borderline",
"now show it as a summer Instagram ad". Every turn is saved as a version on the
sidebar so you can branch and compare.

Built with Next.js + TypeScript, deployed on Vercel.

## How it works

- **`gemini-2.5-flash`** reads the image you uploaded (or your selected variant),
  detects the product, decides whether your prompt is an **edit** of the current
  canvas or a **fresh generation**, and expands your one-liner into four
  detailed, production-quality directions.
- **`gemini-2.5-flash-image`** generates the four images **in parallel** from
  those directions using the appropriate base image.
- The **2×2 canvas grid** lets you click any variation to make it the new base.
- **Version history** lives in IndexedDB under your origin — no server-side
  storage of your images.

## Run locally

```bash
cp .env.example .env.local
# put your key in GEMINI_API_KEY
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

```bash
vercel
# add GEMINI_API_KEY in the Vercel dashboard or:
vercel env add GEMINI_API_KEY
vercel --prod
```

## Environment

| Variable         | Purpose                               |
| ---------------- | ------------------------------------- |
| `GEMINI_API_KEY` | Google AI Studio API key (required).  |

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4
- `@google/genai` SDK
- `idb` for IndexedDB version history
- `lucide-react` icons
