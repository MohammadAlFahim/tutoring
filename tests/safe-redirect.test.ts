import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../lib/safe-redirect";

test("accepts normal same-origin relative paths", () => {
  assert.equal(safeNextPath("/chat"), "/chat");
  assert.equal(safeNextPath("/admin/analytics"), "/admin/analytics");
  assert.equal(safeNextPath("/quiz?topic=trees"), "/quiz?topic=trees");
});

test("falls back for empty / missing", () => {
  assert.equal(safeNextPath(null), "/chat");
  assert.equal(safeNextPath(undefined), "/chat");
  assert.equal(safeNextPath(""), "/chat");
});

test("rejects open-redirect payloads", () => {
  // userinfo trick: `${origin}@evil.com` -> host becomes evil.com
  assert.equal(safeNextPath("@evil.com"), "/chat");
  // protocol-relative
  assert.equal(safeNextPath("//evil.com"), "/chat");
  // backslash tricks
  assert.equal(safeNextPath("/\\evil.com"), "/chat");
  assert.equal(safeNextPath("/\\/evil.com"), "/chat");
  // absolute URLs
  assert.equal(safeNextPath("https://evil.com"), "/chat");
  assert.equal(safeNextPath("http://evil.com/x"), "/chat");
  // relative without leading slash
  assert.equal(safeNextPath("evil.com"), "/chat");
});

test("honors a custom fallback", () => {
  assert.equal(safeNextPath("@evil.com", "/login"), "/login");
});
