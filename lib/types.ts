export type Mode = "generate" | "edit";

export type AspectRatio = "1:1" | "9:16" | "4:5";

export const IG_SIZES: AspectRatio[] = ["1:1", "9:16", "4:5"];

export interface AnalyzeRequest {
  // base64 data URL of the freshly uploaded source product image (only on first turn)
  productImage?: string;
  // base64 data URL of the currently selected variant — context for "edit"
  baseImage?: string;
  prompt: string;
  // recent prompt history for continuity
  history?: { role: "user" | "assistant"; text: string }[];
}

export interface AnalyzeResponse {
  productDescription: string;
  mode: Mode;
  label: string; // short label for sidebar (e.g., "Marble countertop, warm")
  variants: string[]; // exactly 4 expanded prompts
  headlines?: string[]; // 3 ad headlines, only when prompt mentions ad/instagram/etc.
}

export interface GenerateRequest {
  // base64 data URL of the image to use as input to the model (product or selected variant)
  baseImage: string;
  prompts: string[]; // up to N prompts
  aspectRatios?: AspectRatio[]; // optional, per-prompt aspect ratio
  mode: Mode;
}

export interface GenerateResponse {
  images: (string | null)[]; // base64 data URLs, null on failure
  errors: (string | null)[];
}

export interface Variant {
  id: string;
  image: string; // data URL
  prompt: string; // expanded prompt that produced it
  aspectRatio?: AspectRatio;
  createdAt: number;
}

export interface VersionNode {
  id: string;
  parentId: string | null;
  userPrompt: string;
  label: string;
  mode: Mode;
  kind?: "single" | "ig-sizes"; // single = 4 variants, ig-sizes = 3 variants 1 each ratio
  variants: Variant[];
  selectedVariantId: string | null;
  headlines?: string[];
  createdAt: number;
}

export interface Session {
  id: string;
  productImage: string; // original uploaded image
  productDescription: string;
  createdAt: number;
  updatedAt: number;
  rootVersionId: string;
}
