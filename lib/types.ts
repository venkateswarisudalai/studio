export type Mode = "generate" | "edit";

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
}

export interface GenerateRequest {
  // base64 data URL of the image to use as input to the model (product or selected variant)
  baseImage: string;
  prompts: string[]; // 4 prompts
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
  createdAt: number;
}

export interface VersionNode {
  id: string;
  parentId: string | null;
  userPrompt: string;
  label: string;
  mode: Mode;
  variants: Variant[];
  selectedVariantId: string | null;
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
