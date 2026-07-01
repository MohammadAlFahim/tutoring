import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 text-4xl">🔍</div>
      <h1 className="text-lg font-semibold text-gray-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        That page doesn&apos;t exist. Head back to your study session.
      </p>
      <Link
        href="/chat"
        className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        Back to chat
      </Link>
    </main>
  );
}
