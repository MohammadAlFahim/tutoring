import { test } from "node:test";
import assert from "node:assert/strict";
import { extractLectureNo } from "../lib/ingest-util";

test("extracts lecture/week numbers", () => {
  assert.equal(extractLectureNo("Lecture 03 - Trees.pdf"), 3);
  assert.equal(extractLectureNo("lec5.mp3"), 5);
  assert.equal(extractLectureNo("Week 12 notes.docx"), 12);
  assert.equal(extractLectureNo("wk-7.md"), 7);
});

test("does not truncate 3-digit numbers", () => {
  assert.equal(extractLectureNo("Lecture 100 recap.pdf"), 100);
});

test("does not over-match non-lecture filenames (old bare-l bug)", () => {
  assert.equal(extractLectureNo("html5-intro.pdf"), undefined);
  assert.equal(extractLectureNo("level1.pdf"), undefined);
  assert.equal(extractLectureNo("final2.pdf"), undefined);
  assert.equal(extractLectureNo("Additional-1.pdf"), undefined);
  assert.equal(extractLectureNo("notes.pdf"), undefined);
});
