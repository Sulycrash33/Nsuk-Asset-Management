"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Home, RefreshCw, TriangleAlert } from "lucide-react";

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
    <div className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="card w-full max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-nsuk-danger/10">
          <TriangleAlert className="h-7 w-7 text-nsuk-danger" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-nsuk-blue">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-nsuk-muted">
          The page could not be loaded. Try again — if it keeps happening, note what you were doing
          and contact DICT.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-nsuk-faint">Reference: {error.digest}</p>
        )}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button onClick={reset} className="btn-primary">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <Link href="/dashboard" className="btn-ghost">
            <Home className="h-4 w-4" /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
