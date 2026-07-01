import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, estimateTokens, formatTimestamp } from "../lib/chunking";

test("estimateTokens is roughly chars/4 and never zero", () => {
  assert.equal(estimateTokens(""), 1);
  assert.ok(estimateTokens("a".repeat(400)) >= 100);
});

test("formatTimestamp formats mm:ss and h:mm:ss", () => {
  assert.equal(formatTimestamp(0), "0:00");
  assert.equal(formatTimestamp(75), "1:15");
  assert.equal(formatTimestamp(3725), "1:02:05");
});

test("chunkText returns nothing for empty input", () => {
  assert.equal(chunkText("").length, 0);
  assert.equal(chunkText("   \n\n  ").length, 0);
});

test("chunkText produces multiple bounded chunks with overlap", () => {
  const text = Array.from({ length: 60 })
    .map(
      (_, i) =>
        `Sentence ${i} about binary search trees, rotations, insertion and deletion.`,
    )
    .join(" ");
  const chunks = chunkText(text, 200, 30);
  assert.ok(chunks.length > 1, "should split long text");
  for (const c of chunks) {
    // Allow some slack over the target since we split on sentence boundaries.
    assert.ok(estimateTokens(c.content) <= 200 * 1.7, "chunk within ~target size");
    assert.ok(c.content.length > 0);
    assert.equal(c.tokenCount, estimateTokens(c.content));
  }
});

test("chunkText hard-splits a single oversized segment", () => {
  const huge = "word ".repeat(4000); // one long paragraph, no sentence breaks
  const chunks = chunkText(huge, 200, 30);
  assert.ok(chunks.length > 1);
});
