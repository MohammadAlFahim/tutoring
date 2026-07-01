import { test } from "node:test";
import assert from "node:assert/strict";

// Ensure a signing secret exists before the module reads it (lazily at call time).
process.env.QUIZ_SIGNING_SECRET = "test-signing-secret-please-change";

import { encodeQuestionToken, decodeQuestionToken } from "../lib/quiz-token";
import type { QuizQuestionSecret } from "../lib/types";

const mc: QuizQuestionSecret = {
  type: "multiple_choice",
  question: "What is the time complexity of binary search?",
  topic: "complexity",
  options: ["O(1)", "O(log n)", "O(n)", "O(n^2)"],
  correct_index: 1,
  explanation: "Halving the search space each step gives O(log n).",
};

const sa: QuizQuestionSecret = {
  type: "short_answer",
  question: "Explain why a hash table lookup is O(1) on average.",
  topic: "hashing",
  model_answer: "Direct indexing via a hash function distributes keys uniformly.",
  explanation: "Uniform distribution + O(1) index access.",
};

test("MC token round-trips exactly", () => {
  const decoded = decodeQuestionToken(encodeQuestionToken(mc));
  assert.ok(decoded);
  assert.equal(decoded.correct_index, 1);
  assert.equal(decoded.type, "multiple_choice");
  assert.deepEqual(decoded.options, mc.options);
});

test("short-answer token round-trips", () => {
  const decoded = decodeQuestionToken(encodeQuestionToken(sa));
  assert.ok(decoded);
  assert.equal(decoded.type, "short_answer");
  assert.equal(decoded.model_answer, sa.model_answer);
});

test("tampered token is rejected", () => {
  const token = encodeQuestionToken(mc);
  assert.equal(decodeQuestionToken(token.slice(0, -3) + "zzz"), null);
});

test("payload tampering is rejected (signature mismatch)", () => {
  const token = encodeQuestionToken(mc);
  const [, sig] = token.split(".");
  // Swap in a different payload but keep the old signature.
  const forged = Buffer.from(JSON.stringify({ ...mc, correct_index: 0 }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  assert.equal(decodeQuestionToken(`${forged}.${sig}`), null);
});

test("garbage tokens are rejected", () => {
  assert.equal(decodeQuestionToken("not-a-token"), null);
  assert.equal(decodeQuestionToken("a.b.c"), null);
  assert.equal(decodeQuestionToken(""), null);
});
