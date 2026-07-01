"use client";

import { useState } from "react";
import {
  ALLOWED_STUDENT_DOMAIN,
  UNIT,
  UNIVERSITY,
  isEmailAllowed,
} from "@/lib/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginForm({ hadError }: { hadError: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    hadError ? "error" : "idle",
  );
  const [message, setMessage] = useState<string>(
    hadError ? "That sign-in link didn't work. Please request a new one." : "",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();

    if (!isEmailAllowed(trimmed)) {
      setStatus("error");
      setMessage(
        `Sign-up is restricted to ${ALLOWED_STUDENT_DOMAIN} email addresses.`,
      );
      return;
    }

    setStatus("sending");
    setMessage("");

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-xl font-bold text-white"
          >
            {UNIT.match(/[A-Z]/g)?.slice(0, 2).join("") ?? "AI"}
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{UNIT}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your AI study tutor · {UNIVERSITY}
          </p>
        </div>

        {status === "sent" ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center">
            <p className="text-sm font-medium text-green-800">
              Check your email
            </p>
            <p className="mt-1 text-sm text-green-700">
              We sent a magic sign-in link to <strong>{email}</strong>. Open it
              on this device to continue.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Student email
              </span>
              <input
                type="email"
                required
                autoFocus
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`you${ALLOWED_STUDENT_DOMAIN}`}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </label>

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-lg bg-brand px-3 py-2.5 text-base font-medium text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {status === "sending" ? "Sending link…" : "Email me a magic link"}
            </button>

            {status === "error" && (
              <p role="alert" className="text-sm text-red-600">
                {message}
              </p>
            )}

            <p className="pt-2 text-center text-xs text-gray-500">
              Only {ALLOWED_STUDENT_DOMAIN} addresses can sign up. No password
              needed — we email you a one-time link.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
