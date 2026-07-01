import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMath } from "../lib/markdown";

test("converts inline \\( \\) to $", () => {
  assert.equal(normalizeMath("height ~\\(\\log n\\) here"), "height ~$\\log n$ here");
});

test("converts display \\[ \\] to $$", () => {
  assert.equal(normalizeMath("\\[ x^2 \\]"), "$$ x^2 $$");
});

test("leaves plain markdown untouched", () => {
  const md = "**bold** and a list:\n- one\n- two";
  assert.equal(normalizeMath(md), md);
});

test("does not touch fenced code blocks", () => {
  const code = "```\nfoo \\(not math\\) bar\n```";
  assert.equal(normalizeMath(code), code);
});

test("does not touch inline code spans", () => {
  const s = "use `arr\\(i\\)` and also \\(x\\)";
  assert.equal(normalizeMath(s), "use `arr\\(i\\)` and also $x$");
});

test("handles multiple math spans in one string", () => {
  assert.equal(
    normalizeMath("\\(a\\) then \\[b\\] then \\(c\\)"),
    "$a$ then $$b$$ then $c$",
  );
});
