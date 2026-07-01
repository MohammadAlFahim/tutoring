import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmailAllowed } from "../lib/config";
import { TUTOR_SYSTEM_PROMPT, buildGroundedUserContent } from "../lib/ai/prompts";
import { getEmbeddingProvider } from "../lib/ai/embeddings";
import type { RetrievedChunk } from "../lib/types";

test("isEmailAllowed: admin allowed, student domain allowed, others rejected", () => {
  // Uses defaults from lib/config (admin alfahim2179@gmail.com, @student.curtin.edu.au).
  assert.equal(isEmailAllowed("alfahim2179@gmail.com"), true);
  assert.equal(isEmailAllowed("Student.One@student.curtin.edu.au"), true);
  assert.equal(isEmailAllowed("someone@gmail.com"), false);
  assert.equal(isEmailAllowed("attacker@evil.com"), false);
  assert.equal(isEmailAllowed(""), false);
  // Must be the exact domain suffix, not a lookalike.
  assert.equal(isEmailAllowed("x@notstudent.curtin.edu.au.evil.com"), false);
});

test("tutor system prompt is grounded and academic-integrity aware", () => {
  assert.match(TUTOR_SYSTEM_PROMPT, /study tutor/i);
  assert.match(TUTOR_SYSTEM_PROMPT, /Socratic/i);
  assert.match(TUTOR_SYSTEM_PROMPT, /graded work/i);
  assert.match(TUTOR_SYSTEM_PROMPT, /Never invent citations/i);
});

test("buildGroundedUserContent numbers excerpts and appends the question", () => {
  const chunks: RetrievedChunk[] = [
    {
      id: "1",
      document_id: "d1",
      content: "A binary search tree keeps keys ordered.",
      metadata: { page: 4 },
      token_count: 10,
      source_title: "Lecture 3 Trees",
      source_type: "slides",
      similarity: 0.9,
    },
  ];
  const out = buildGroundedUserContent("What is a BST?", chunks);
  assert.match(out, /\[1\]/);
  assert.match(out, /Lecture 3 Trees/);
  assert.match(out, /slide 4/);
  assert.match(out, /Student question: What is a BST\?/);
});

test("buildGroundedUserContent handles no excerpts gracefully", () => {
  const out = buildGroundedUserContent("Anything?", []);
  assert.match(out, /No relevant excerpts/i);
  assert.match(out, /outside the unit/i);
});

test("embedding provider reports voyage + 1024 dims without needing a key", () => {
  const p = getEmbeddingProvider();
  assert.equal(p.name, "voyage");
  assert.equal(p.dimensions, 1024);
});
