import { createHmac, timingSafeEqual } from "node:crypto";
import { QUIZ_SIGNING_SECRET } from "@/lib/env";
import type { QuizQuestionSecret } from "@/lib/types";

/**
 * Quiz questions are generated server-side together with their correct answers.
 * We must NOT send the answers to the browser, but we also don't want to keep
 * per-quiz server state. So we pack the secret answer into an HMAC-signed token:
 * the client holds it opaquely and returns it when grading, and the server
 * verifies the signature before trusting it. Tamper-proof and stateless.
 */

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(
    input.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64",
  );
}

function sign(payload: string): string {
  return b64url(
    createHmac("sha256", QUIZ_SIGNING_SECRET()).update(payload).digest(),
  );
}

export function encodeQuestionToken(secret: QuizQuestionSecret): string {
  const payload = b64url(JSON.stringify(secret));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function decodeQuestionToken(token: string): QuizQuestionSecret | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = sign(payload);

  // Constant-time comparison.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(fromB64url(payload).toString("utf8")) as QuizQuestionSecret;
  } catch {
    return null;
  }
}
