"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Upload,
  Send,
  Plus,
  Minus,
  ImageIcon,
  Loader2,
  X,
  Trash2,
  AlertTriangle,
  Download,
  ArrowLeft,
} from "lucide-react";
import clsx from "clsx";
import {
  deleteSession,
  listSessions,
  listVersions,
  putSession,
  putVersion,
} from "@/lib/db";
import { downscaleDataUrl, fileToDataUrl, uid } from "@/lib/utils";
import type {
  AnalyzeResponse,
  GenerateResponse,
  Session,
  Variant,
  VersionNode,
} from "@/lib/types";

const EXAMPLES = [
  {
    id: "1",
    title: "Perfume bottle",
    hint: "Lifestyle on marble countertop",
    thumb:
      "https://images.unsplash.com/photo-1541643600914-78b084683601?w=480&q=70&fm=jpg",
  },
  {
    id: "2",
    title: "Skincare jar",
    hint: "Editorial pastel sand",
    thumb:
      "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=480&q=70&fm=jpg",
  },
  {
    id: "3",
    title: "Sneaker",
    hint: "Bold summer Instagram ad",
    thumb:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=480&q=70&fm=jpg",
  },
];

type Loading =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "analyzing" }
  | { kind: "generating"; versionId: string };

export default function Studio() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [versions, setVersions] = useState<VersionNode[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null); // for empty state
  const [pendingTitle, setPendingTitle] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState<Loading>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  // Load sessions on mount
  useEffect(() => {
    (async () => {
      try {
        const s = await listSessions();
        setSessions(s);
      } catch (e) {
        console.warn("Failed to list sessions", e);
      }
    })();
  }, []);

  // When a session is opened, load its versions
  useEffect(() => {
    if (!session) {
      setVersions([]);
      setActiveVersionId(null);
      return;
    }
    (async () => {
      try {
        const v = await listVersions(session.id);
        setVersions(v);
        if (v.length) {
          setActiveVersionId(v[v.length - 1].id);
        }
      } catch (e) {
        console.warn("Failed to load versions", e);
      }
    })();
  }, [session]);

  const activeVersion = useMemo(
    () => versions.find((v) => v.id === activeVersionId) ?? null,
    [versions, activeVersionId]
  );

  const activeBaseImage = useMemo(() => {
    if (!activeVersion || !session) return null;
    const sel =
      activeVersion.variants.find(
        (v) => v.id === activeVersion.selectedVariantId
      ) ?? activeVersion.variants[0];
    return sel?.image ?? session.productImage;
  }, [activeVersion, session]);

  const refreshSessions = useCallback(async () => {
    setSessions(await listSessions());
  }, []);

  const handlePickFile = useCallback(async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    const raw = await fileToDataUrl(file);
    const small = await downscaleDataUrl(raw);
    setPendingImage(small);
    setPendingTitle(file.name.replace(/\.[^.]+$/, ""));
    promptInputRef.current?.focus();
  }, []);

  const handleExample = useCallback(async (id: string) => {
    setError(null);
    setLoading({ kind: "starting" });
    try {
      const res = await fetch(`/api/example?id=${id}`);
      if (!res.ok) throw new Error(`Couldn't load example (${res.status})`);
      const data = (await res.json()) as {
        image: string;
        prompt: string;
        title: string;
      };
      const small = await downscaleDataUrl(data.image);
      setPendingImage(small);
      setPendingTitle(data.title);
      setPrompt(data.prompt);
      promptInputRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load example");
    } finally {
      setLoading({ kind: "idle" });
    }
  }, []);

  const startNewSession = useCallback(() => {
    setSession(null);
    setVersions([]);
    setActiveVersionId(null);
    setPendingImage(null);
    setPendingTitle("");
    setPrompt("");
    setError(null);
  }, []);

  const openSession = useCallback(async (s: Session) => {
    setSession(s);
    setPendingImage(null);
    setPrompt("");
    setError(null);
  }, []);

  const handleDeleteSession = useCallback(
    async (s: Session, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm(`Delete "${s.productDescription.slice(0, 40)}"?`)) return;
      await deleteSession(s.id);
      await refreshSessions();
      if (session?.id === s.id) startNewSession();
    },
    [refreshSessions, session, startNewSession]
  );

  const generateTurn = useCallback(
    async (opts: {
      sessionToUse: Session;
      baseImage: string;
      previousVersions: VersionNode[];
      userPrompt: string;
      parentId: string | null;
    }) => {
      const { sessionToUse, baseImage, previousVersions, userPrompt, parentId } =
        opts;
      setError(null);
      setLoading({ kind: "analyzing" });

      try {
        const history = previousVersions.slice(-4).flatMap((v) => [
          { role: "user" as const, text: v.userPrompt },
          { role: "assistant" as const, text: v.label },
        ]);

        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            baseImage,
            productImage: sessionToUse.productImage,
            prompt: userPrompt,
            history,
          }),
        });
        if (!analyzeRes.ok) {
          const data = await analyzeRes.json().catch(() => ({}));
          throw new Error(data.error || `Analyze failed (${analyzeRes.status})`);
        }
        const analyze = (await analyzeRes.json()) as AnalyzeResponse;

        // For "generate" mode, condition on the original product image so the
        // model isn't anchored to the previous scene; for "edit" use the
        // currently selected canvas variant.
        const conditioning =
          analyze.mode === "generate" ? sessionToUse.productImage : baseImage;

        const versionId = uid();
        const placeholder: VersionNode = {
          id: versionId,
          parentId,
          userPrompt,
          label: analyze.label,
          mode: analyze.mode,
          variants: [],
          selectedVariantId: null,
          createdAt: Date.now(),
        };

        // Optimistically add the version so the UI shows progress
        setVersions((prev) => [...prev, placeholder]);
        setActiveVersionId(versionId);
        setLoading({ kind: "generating", versionId });

        const genRes = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            baseImage: conditioning,
            prompts: analyze.variants,
            mode: analyze.mode,
          }),
        });
        if (!genRes.ok) {
          const data = await genRes.json().catch(() => ({}));
          throw new Error(data.error || `Generate failed (${genRes.status})`);
        }
        const gen = (await genRes.json()) as GenerateResponse;

        const variants: Variant[] = gen.images
          .map((img, i) =>
            img
              ? ({
                  id: uid(),
                  image: img,
                  prompt: analyze.variants[i] ?? userPrompt,
                  createdAt: Date.now(),
                } as Variant)
              : null
          )
          .filter((v): v is Variant => v !== null);

        if (!variants.length) {
          // Surface first error if all 4 failed
          const firstErr = gen.errors.find((e) => e) ?? "All generations failed";
          throw new Error(firstErr);
        }

        const finalVersion: VersionNode = {
          ...placeholder,
          variants,
          selectedVariantId: variants[0].id,
        };
        await putVersion(sessionToUse.id, finalVersion);

        const updatedSession: Session = {
          ...sessionToUse,
          updatedAt: Date.now(),
        };
        await putSession(updatedSession);

        setVersions((prev) =>
          prev.map((v) => (v.id === versionId ? finalVersion : v))
        );
        setSession(updatedSession);
        setPrompt("");
        await refreshSessions();
      } catch (e) {
        // remove placeholder on failure
        setVersions((prev) => prev.filter((v) => v.variants.length > 0));
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading({ kind: "idle" });
      }
    },
    [refreshSessions]
  );

  const handleSubmitInitial = useCallback(async () => {
    if (!pendingImage || !prompt.trim()) return;
    const newSessionId = uid();
    const newSession: Session = {
      id: newSessionId,
      productImage: pendingImage,
      productDescription: pendingTitle || "Product",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      rootVersionId: "",
    };
    await putSession(newSession);
    setSession(newSession);
    setPendingImage(null);
    await generateTurn({
      sessionToUse: newSession,
      baseImage: pendingImage,
      previousVersions: [],
      userPrompt: prompt.trim(),
      parentId: null,
    });
  }, [generateTurn, pendingImage, pendingTitle, prompt]);

  const handleSubmitFollowup = useCallback(async () => {
    if (!session || !activeBaseImage || !prompt.trim()) return;
    await generateTurn({
      sessionToUse: session,
      baseImage: activeBaseImage,
      previousVersions: versions,
      userPrompt: prompt.trim(),
      parentId: activeVersionId,
    });
  }, [activeBaseImage, activeVersionId, generateTurn, prompt, session, versions]);

  const onSubmit = () => {
    if (!session) return handleSubmitInitial();
    return handleSubmitFollowup();
  };

  const selectVariant = useCallback(
    async (versionId: string, variantId: string) => {
      if (!session) return;
      const updated = versions.map((v) =>
        v.id === versionId ? { ...v, selectedVariantId: variantId } : v
      );
      setVersions(updated);
      const v = updated.find((x) => x.id === versionId);
      if (v) await putVersion(session.id, v);
      setActiveVersionId(versionId);
    },
    [session, versions]
  );

  const isWorking = loading.kind !== "idle";

  return (
    <div className="grid h-screen grid-cols-[280px_1fr] bg-[var(--bg)]">
      {/* Sidebar */}
      <aside className="flex flex-col border-r border-[var(--border)] bg-[var(--bg-elev)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-black">
            <Sparkles size={16} />
          </div>
          <div className="font-semibold tracking-tight">Studio</div>
        </div>

        <button
          onClick={startNewSession}
          className="m-3 flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-sm font-medium hover:bg-[#23232b]"
        >
          <Plus size={16} /> New canvas
        </button>

        {/* Version history when in a session */}
        {session ? (
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <button
              onClick={startNewSession}
              className="mb-2 flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-white"
            >
              <ArrowLeft size={12} /> All canvases
            </button>
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Versions
            </div>
            <VersionTimeline
              productImage={session.productImage}
              versions={versions}
              activeVersionId={activeVersionId}
              onSelect={(vid) => setActiveVersionId(vid)}
              loading={loading}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Recent canvases
            </div>
            {sessions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-xs text-[var(--muted)]">
                No canvases yet. Upload a product photo or pick an example to
                start.
              </div>
            ) : (
              <ul className="space-y-1">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => openSession(s)}
                      className="group flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-[var(--bg-elev-2)]"
                    >
                      <img
                        src={s.productImage}
                        alt=""
                        className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">
                          {s.productDescription}
                        </div>
                        <div className="text-[11px] text-[var(--muted)]">
                          {new Date(s.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteSession(s, e)}
                        className="opacity-0 transition group-hover:opacity-100"
                        aria-label="Delete"
                      >
                        <Trash2
                          size={14}
                          className="text-[var(--muted)] hover:text-red-400"
                        />
                      </button>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="border-t border-[var(--border)] px-4 py-3 text-[11px] text-[var(--muted)]">
          Powered by Gemini 2.5 Flash · stored locally
        </div>
      </aside>

      {/* Main */}
      <main className="relative flex min-h-0 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
          <div className="min-w-0">
            {session ? (
              <div className="truncate text-sm text-[var(--muted)]">
                {session.productDescription}
              </div>
            ) : (
              <div className="text-sm text-[var(--muted)]">
                Start by uploading a product photo or picking an example
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeVersion?.variants.length ? (
              <DownloadActiveButton activeVersion={activeVersion} />
            ) : null}
          </div>
        </header>

        {/* Canvas */}
        <section className="relative flex-1 overflow-y-auto">
          {!session && !pendingImage ? (
            <EmptyState
              onUpload={() => fileInput.current?.click()}
              onExample={handleExample}
              isLoadingExample={loading.kind === "starting"}
            />
          ) : !session && pendingImage ? (
            <PendingPreview
              image={pendingImage}
              title={pendingTitle}
              onClear={() => {
                setPendingImage(null);
                setPendingTitle("");
              }}
            />
          ) : (
            <CanvasView
              session={session!}
              versions={versions}
              activeVersion={activeVersion}
              loading={loading}
              onSelectVariant={selectVariant}
              error={error}
              onClearError={() => setError(null)}
            />
          )}
        </section>

        {/* Prompt bar */}
        <PromptBar
          prompt={prompt}
          setPrompt={setPrompt}
          inputRef={promptInputRef}
          disabled={isWorking || (!session && !pendingImage)}
          isWorking={isWorking}
          onSubmit={onSubmit}
          placeholder={
            session
              ? "Describe the next change — e.g. make the background warmer, add a borderline…"
              : pendingImage
                ? "Describe the scene — e.g. lifestyle photo on a marble countertop"
                : "Upload an image or pick an example to begin"
          }
          showUpload={!session}
          onUpload={() => fileInput.current?.click()}
        />

        {error ? (
          <ErrorToast message={error} onDismiss={() => setError(null)} />
        ) : null}

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handlePickFile(f);
            e.target.value = "";
          }}
        />
      </main>
    </div>
  );
}

/* ---------------- Sub components ---------------- */

function VersionTimeline({
  productImage,
  versions,
  activeVersionId,
  onSelect,
  loading,
}: {
  productImage: string;
  versions: VersionNode[];
  activeVersionId: string | null;
  onSelect: (id: string) => void;
  loading: Loading;
}) {
  return (
    <ol className="space-y-1.5">
      <li className="flex items-center gap-3 rounded-lg p-2 text-xs text-[var(--muted)]">
        <img src={productImage} alt="" className="h-10 w-10 rounded-md object-cover" />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider">Source</div>
          <div className="truncate">Original product</div>
        </div>
      </li>
      {versions.map((v, i) => {
        const sel =
          v.variants.find((x) => x.id === v.selectedVariantId) ?? v.variants[0];
        const isLoading =
          loading.kind === "generating" &&
          loading.versionId === v.id &&
          v.variants.length === 0;
        const active = v.id === activeVersionId;
        return (
          <li key={v.id}>
            <button
              onClick={() => onSelect(v.id)}
              className={clsx(
                "flex w-full items-center gap-3 rounded-lg p-2 text-left transition",
                active
                  ? "bg-[var(--bg-elev-2)] ring-1 ring-[var(--accent)]/60"
                  : "hover:bg-[var(--bg-elev-2)]"
              )}
            >
              <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-[var(--bg-elev-2)]">
                {sel ? (
                  <img
                    src={sel.image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="shimmer h-full w-full" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  <span>v{i + 1}</span>
                  <span
                    className={clsx(
                      "rounded px-1 py-[1px] text-[9px]",
                      v.mode === "edit"
                        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "bg-[var(--accent-2)]/15 text-[var(--accent-2)]"
                    )}
                  >
                    {v.mode}
                  </span>
                </div>
                <div className="truncate text-sm">{v.label}</div>
              </div>
              {isLoading && (
                <Loader2 size={14} className="animate-spin text-[var(--muted)]" />
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function EmptyState({
  onUpload,
  onExample,
  isLoadingExample,
}: {
  onUpload: () => void;
  onExample: (id: string) => void;
  isLoadingExample: boolean;
}) {
  return (
    <div className="aurora relative flex min-h-full flex-col items-center justify-center px-8 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-black">
          <Sparkles size={22} />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Turn product photos into stories.
        </h1>
        <p className="mt-3 text-base text-[var(--muted)]">
          Drop in a product shot, describe the vibe, and Studio will produce four
          beautifully composed variations. Click any to keep iterating.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            onClick={onUpload}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-black shadow-sm hover:bg-white/90"
          >
            <Upload size={16} /> Upload a product photo
          </button>
          <div className="text-xs text-[var(--muted)]">
            or try one of these — no upload needed
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              disabled={isLoadingExample}
              onClick={() => onExample(ex.id)}
              className="group relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-3 text-left transition hover:border-white/30 disabled:opacity-50"
            >
              <div className="relative mb-2 aspect-square overflow-hidden rounded-lg bg-[var(--bg-elev-2)]">
                <div className="absolute inset-0 grid place-items-center text-[var(--muted)]">
                  <ImageIcon size={28} />
                </div>
                <img
                  src={ex.thumb}
                  alt={ex.title}
                  className="relative h-full w-full object-cover transition group-hover:scale-[1.03]"
                  loading="lazy"
                />
              </div>
              <div className="text-sm font-medium">{ex.title}</div>
              <div className="text-xs text-[var(--muted)]">{ex.hint}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PendingPreview({
  image,
  title,
  onClear,
}: {
  image: string;
  title: string;
  onClear: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="relative w-full max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]">
          <img
            src={image}
            alt={title}
            className="max-h-[45vh] w-full object-contain"
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm">Ready to transform</div>
            <div className="text-xs text-[var(--muted)]">
              Describe the scene below, then hit Generate.
            </div>
          </div>
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-white"
          >
            <X size={14} /> Replace
          </button>
        </div>
      </div>
    </div>
  );
}

function CanvasView({
  session,
  versions,
  activeVersion,
  loading,
  onSelectVariant,
  error,
  onClearError,
}: {
  session: Session;
  versions: VersionNode[];
  activeVersion: VersionNode | null;
  loading: Loading;
  onSelectVariant: (versionId: string, variantId: string) => void;
  error: string | null;
  onClearError: () => void;
}) {
  const [zoom, setZoom] = useState(50); // grid container width in vh; default 50vh ⇒ ~½ screen
  const isGeneratingThisVersion =
    activeVersion &&
    loading.kind === "generating" &&
    loading.versionId === activeVersion.id &&
    activeVersion.variants.length === 0;

  const isAnalyzing = loading.kind === "analyzing" && versions.length === 0;

  if (!activeVersion) {
    if (isAnalyzing) {
      return <AnalyzingState zoom={zoom} />;
    }
    return (
      <div className="flex h-full items-center justify-center p-8 text-[var(--muted)]">
        Pick a version from the sidebar.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-4">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span
              className={clsx(
                "rounded px-1.5 py-0.5",
                activeVersion.mode === "edit"
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "bg-[var(--accent-2)]/15 text-[var(--accent-2)]"
              )}
            >
              {activeVersion.mode}
            </span>
            <span>{new Date(activeVersion.createdAt).toLocaleTimeString()}</span>
          </div>
          <h2 className="mt-1 truncate text-lg font-semibold tracking-tight">
            {activeVersion.label}
          </h2>
          <div className="mt-0.5 max-w-2xl truncate text-xs text-[var(--muted)]">
            “{activeVersion.userPrompt}”
          </div>
        </div>
        <ZoomControl zoom={zoom} setZoom={setZoom} />
      </div>

      <div
        className="mx-auto grid grid-cols-2 gap-3"
        style={{ width: `min(100%, ${zoom}vh)` }}
      >
        {[0, 1, 2, 3].map((i) => {
          const v = activeVersion.variants[i];
          const selected = v && v.id === activeVersion.selectedVariantId;
          if (!v) {
            return (
              <div
                key={i}
                className="aspect-square overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elev)]"
              >
                <div className="shimmer h-full w-full" />
              </div>
            );
          }
          return (
            <button
              key={v.id}
              onClick={() => onSelectVariant(activeVersion.id, v.id)}
              className={clsx(
                "group relative aspect-square overflow-hidden rounded-xl border bg-[var(--bg-elev)] transition",
                selected
                  ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/40"
                  : "border-[var(--border)] hover:border-white/30"
              )}
            >
              <img
                src={v.image}
                alt={`Variant ${i + 1}`}
                className="h-full w-full object-cover transition group-hover:scale-[1.02]"
              />
              <div className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] backdrop-blur">
                {i + 1}
              </div>
              {selected && (
                <div className="absolute right-1.5 top-1.5 rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-medium text-black">
                  Base
                </div>
              )}
            </button>
          );
        })}
      </div>

      {isGeneratingThisVersion && (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--muted)]">
          <Loader2 size={14} className="animate-spin" />
          Crafting four directions…
        </div>
      )}

      {error && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-red-400" />
          <div className="flex-1">
            <div className="font-medium text-red-200">Something went wrong</div>
            <div className="mt-0.5 text-red-300/80">{error}</div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
          >
            Reload
          </button>
          <button onClick={onClearError} aria-label="Dismiss">
            <X size={16} className="text-[var(--muted)]" />
          </button>
        </div>
      )}
    </div>
  );
}

function AnalyzingState({ zoom = 50 }: { zoom?: number }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-4">
      <div className="mb-3">
        <div className="h-3 w-24 rounded bg-[var(--bg-elev-2)]" />
        <div className="mt-2 h-5 w-64 rounded bg-[var(--bg-elev-2)]" />
      </div>
      <div
        className="mx-auto grid grid-cols-2 gap-3"
        style={{ width: `min(100%, ${zoom}vh)` }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="aspect-square overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elev)]"
          >
            <div className="shimmer h-full w-full" />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--muted)]">
        <Loader2 size={14} className="animate-spin" />
        Reading the brief…
      </div>
    </div>
  );
}

function ZoomControl({
  zoom,
  setZoom,
}: {
  zoom: number;
  setZoom: (n: number) => void;
}) {
  const MIN = 30;
  const MAX = 90;
  return (
    <div className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-1.5 py-1">
      <button
        type="button"
        onClick={() => setZoom(Math.max(MIN, zoom - 10))}
        className="grid h-6 w-6 place-items-center rounded text-[var(--muted)] hover:bg-[var(--bg-elev-2)] hover:text-white"
        aria-label="Zoom out"
      >
        <Minus size={12} />
      </button>
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={5}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        className="h-1 w-20 cursor-pointer accent-[var(--accent)]"
        aria-label="Canvas zoom"
      />
      <button
        type="button"
        onClick={() => setZoom(Math.min(MAX, zoom + 10))}
        className="grid h-6 w-6 place-items-center rounded text-[var(--muted)] hover:bg-[var(--bg-elev-2)] hover:text-white"
        aria-label="Zoom in"
      >
        <Plus size={12} />
      </button>
      <span className="ml-1 w-9 text-right text-[10px] tabular-nums text-[var(--muted)]">
        {Math.round((zoom / 50) * 100)}%
      </span>
    </div>
  );
}

function PromptBar({
  prompt,
  setPrompt,
  inputRef,
  disabled,
  isWorking,
  onSubmit,
  placeholder,
  showUpload,
  onUpload,
}: {
  prompt: string;
  setPrompt: (s: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  isWorking: boolean;
  onSubmit: () => void;
  placeholder: string;
  showUpload: boolean;
  onUpload: () => void;
}) {
  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-elev)]/80 p-4 backdrop-blur">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled && prompt.trim()) onSubmit();
        }}
        className="mx-auto flex max-w-3xl items-end gap-2"
      >
        {showUpload && (
          <button
            type="button"
            onClick={onUpload}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] text-[var(--muted)] hover:text-white"
            aria-label="Upload"
          >
            <Upload size={16} />
          </button>
        )}
        <div className="relative flex-1">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!disabled && prompt.trim()) onSubmit();
              }
            }}
            placeholder={placeholder}
            rows={1}
            className="block w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] px-4 py-3 pr-14 text-sm leading-tight outline-none placeholder:text-[var(--muted)] focus:border-white/30"
            style={{ maxHeight: 160 }}
          />
          <button
            type="submit"
            disabled={disabled || !prompt.trim()}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-white text-black transition disabled:bg-[var(--bg-elev-2)] disabled:text-[var(--muted)]"
            aria-label="Generate"
          >
            {isWorking ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function ErrorToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-20 mx-auto flex justify-center">
      <div className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-xl border border-red-900/60 bg-red-950/90 p-3 text-sm shadow-2xl backdrop-blur">
        <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-red-400" />
        <div className="flex-1 text-red-200">{message}</div>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-red-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600"
        >
          Reload
        </button>
        <button onClick={onDismiss} aria-label="Dismiss">
          <X size={16} className="text-red-300" />
        </button>
      </div>
    </div>
  );
}

function DownloadActiveButton({ activeVersion }: { activeVersion: VersionNode }) {
  const sel =
    activeVersion.variants.find((v) => v.id === activeVersion.selectedVariantId) ??
    activeVersion.variants[0];
  if (!sel) return null;
  return (
    <a
      href={sel.image}
      download={`${activeVersion.label.replace(/\s+/g, "-").toLowerCase()}.png`}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs hover:bg-[var(--bg-elev-2)]"
    >
      <Download size={14} /> Download
    </a>
  );
}

