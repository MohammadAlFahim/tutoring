"use client";

import { useEffect } from "react";

export default function Error({
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
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 text-4xl">⚠️</div>
      <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        An unexpected error occurred. You can try again — if it keeps happening,
        the app may still be waiting on configuration (Supabase / API keys).
      </p>
      <div className="mt-5 flex gap-2">
        <button
          onClick={reset}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Try again
        </button>
        <a
          href="/chat"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Back to chat
        </a>
      </div>
    </main>
  );
}
