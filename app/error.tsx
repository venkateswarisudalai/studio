"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 text-center">
      <div className="max-w-md">
        <div className="mb-3 text-3xl">⚠️</div>
        <h1 className="text-xl font-semibold">Studio hit a snag</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {error.message || "Something unexpected happened."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={() => reset()}
            className="rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] px-4 py-2 text-sm hover:bg-[#23232b]"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
