import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeAnalytics,
  type RawAttempt,
  type RawEvent,
  type RawUser,
} from "../lib/analytics";

const now = new Date("2026-06-30T12:00:00Z");
const day = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

const events: RawEvent[] = [
  { user_id: "u1", type: "question_asked", payload: { question: "explain binary trees rotation" }, created_at: day(0) },
  { user_id: "u1", type: "question_asked", payload: { question: "what about hashing collisions" }, created_at: day(2) },
  { user_id: "u2", type: "question_asked", payload: { question: "binary trees again please" }, created_at: day(0) },
  { user_id: "u2", type: "deep_explain_used", payload: {}, created_at: day(0) },
  { user_id: "u2", type: "quiz_started", payload: { topic: "trees" }, created_at: day(1) },
];

const attempts: RawAttempt[] = [
  { user_id: "u1", topic: "trees", is_correct: true, created_at: day(0) },
  { user_id: "u1", topic: "trees", is_correct: false, created_at: day(0) },
  { user_id: "u2", topic: "hashing", is_correct: true, created_at: day(1) },
];

const users: RawUser[] = [
  { id: "u1", email: "a@student.curtin.edu.au", created_at: day(10) },
  { id: "u2", email: "b@student.curtin.edu.au", created_at: day(5) },
  { id: "u3", email: "c@student.curtin.edu.au", created_at: day(1) }, // signed up, never active
];

test("totals are computed correctly", () => {
  const a = computeAnalytics(events, attempts, users, now);
  assert.equal(a.totals.signups, 3);
  assert.equal(a.totals.activeUsers, 2);
  assert.equal(a.totals.questions, 3);
  assert.equal(a.totals.deepExplains, 1);
  assert.equal(a.totals.quizzesStarted, 1);
  assert.equal(a.totals.quizQuestionsAnswered, 3);
});

test("retention counts users active on 2+ days", () => {
  const a = computeAnalytics(events, attempts, users, now);
  // u1 active on day 0 and day 2 -> returning. u2 active day 0 and day 1 -> returning.
  assert.equal(a.retention.returningUsers, 2);
  assert.equal(a.retention.returningRate, 1);
});

test("funnel: signups -> asked -> returned", () => {
  const a = computeAnalytics(events, attempts, users, now);
  assert.equal(a.funnel.signups, 3);
  assert.equal(a.funnel.askedQuestion, 2);
  assert.equal(a.funnel.returned, 2);
});

test("quiz accuracy and by-topic breakdown", () => {
  const a = computeAnalytics(events, attempts, users, now);
  assert.ok(Math.abs(a.quiz.accuracy - 2 / 3) < 1e-9);
  const trees = a.quiz.byTopic.find((t) => t.topic === "trees");
  assert.ok(trees);
  assert.equal(trees.total, 2);
  assert.equal(trees.correct, 1);
});

test("top topics extracts keywords and drops stopwords", () => {
  const a = computeAnalytics(events, attempts, users, now);
  const terms = a.topTopics.map((t) => t.term);
  assert.ok(terms.includes("binary") || terms.includes("trees"));
  assert.ok(!terms.includes("what")); // stopword
  assert.ok(!terms.includes("the"));
});

test("empty inputs do not throw and yield zeros", () => {
  const a = computeAnalytics([], [], [], now);
  assert.equal(a.totals.signups, 0);
  assert.equal(a.quiz.accuracy, 0);
  assert.equal(a.retention.returningRate, 0);
  assert.equal(a.dailyActive.length, 14);
});
