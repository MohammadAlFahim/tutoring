"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { UNIT } from "@/lib/config";
import type { QuizQuestionPublic } from "@/lib/types";

interface GradeResult {
  is_correct: boolean;
  feedback: string;
  correct_answer: string | null;
  correct_index: number | null;
  explanation: string;
}

type Phase = "setup" | "loading" | "active" | "done";

export default function QuizClient({ initialTopic }: { initialTopic: string }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [topic, setTopic] = useState(initialTopic);
  const [count, setCount] = useState(5);
  const [error, setError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<QuizQuestionPublic[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const sessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now()),
  );

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), n: count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate a quiz.");
      if (!data.questions?.length) throw new Error("No questions were generated.");
      setQuestions(data.questions);
      setIndex(0);
      setCorrectCount(0);
      resetQuestionState();
      setPhase("active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("setup");
    }
  }

  function resetQuestionState() {
    setSelected(null);
    setTextAnswer("");
    setResult(null);
  }

  async function submitAnswer() {
    const q = questions[index];
    if (!q) return;
    if (q.type === "multiple_choice" && selected === null) return;
    if (q.type === "short_answer" && !textAnswer.trim()) return;

    setGrading(true);
    setError(null);
    try {
      const res = await fetch("/api/quiz/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: q.token,
          answer: q.type === "multiple_choice" ? selected : textAnswer.trim(),
          sessionId: sessionIdRef.current,
        }),
      });
      const data = (await res.json()) as GradeResult & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not grade your answer.");
      setResult(data);
      if (data.is_correct) setCorrectCount((c) => c + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGrading(false);
    }
  }

  function next() {
    if (index + 1 >= questions.length) {
      setPhase("done");
    } else {
      setIndex((i) => i + 1);
      resetQuestionState();
    }
  }

  function restart() {
    setPhase("setup");
    setQuestions([]);
    setResult(null);
    setError(null);
  }

  const current = questions[index];

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-gray-900">
            Practice quiz
          </h1>
          <p className="truncate text-xs text-gray-500">{UNIT}</p>
        </div>
        <Link
          href="/chat"
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          ← Back to chat
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        {/* ---- Setup ---- */}
        {phase === "setup" && (
          <form onSubmit={generate} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                What topic do you want to practice?
              </label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                autoFocus
                placeholder="e.g. binary search trees"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Number of questions
              </label>
              <div className="flex gap-2">
                {[3, 5, 8].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setCount(n)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      count === n
                        ? "border-brand bg-brand-light text-brand"
                        : "border-gray-300 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={!topic.trim()}
              className="w-full rounded-lg bg-brand px-3 py-2.5 text-base font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              Generate quiz
            </button>
            <p className="text-center text-xs text-gray-500">
              Questions are drawn from the unit&apos;s materials. Short answers
              are graded with specific feedback.
            </p>
          </form>
        )}

        {/* ---- Loading ---- */}
        {phase === "loading" && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <p className="text-sm text-gray-500">
              Building your quiz on <strong>{topic}</strong>…
            </p>
          </div>
        )}

        {/* ---- Active ---- */}
        {phase === "active" && current && (
          <div>
            <div className="mb-4 flex items-center justify-between text-xs text-gray-500">
              <span>
                Question {index + 1} of {questions.length}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5">
                {current.type === "multiple_choice"
                  ? "Multiple choice"
                  : "Short answer"}
              </span>
            </div>

            <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full bg-brand transition-all"
                style={{ width: `${((index + 1) / questions.length) * 100}%` }}
              />
            </div>

            <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-[15px] font-medium text-gray-900">
                {current.question}
              </p>

              {current.type === "multiple_choice" && current.options && (
                <div className="mt-4 space-y-2">
                  {current.options.map((opt, i) => {
                    const isSelected = selected === i;
                    // Highlight by index (robust to duplicate option text); fall
                    // back to text match only if the index is missing.
                    const isAnswerKey =
                      !!result &&
                      (result.correct_index != null
                        ? result.correct_index === i
                        : current.options != null &&
                          result.correct_answer === current.options[i]);
                    const showWrong = result && isSelected && !result.is_correct;
                    return (
                      <button
                        key={i}
                        disabled={!!result}
                        onClick={() => setSelected(i)}
                        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                          isAnswerKey
                            ? "border-green-400 bg-green-50 text-green-800"
                            : showWrong
                              ? "border-red-400 bg-red-50 text-red-800"
                              : isSelected
                                ? "border-brand bg-brand-light text-brand"
                                : "border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span className="font-mono text-xs text-gray-500">
                          {String.fromCharCode(65 + i)}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {current.type === "short_answer" && (
                <textarea
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  disabled={!!result}
                  rows={4}
                  placeholder="Write your answer…"
                  className="mt-4 w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:bg-gray-50"
                />
              )}

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

              {/* Feedback */}
              {result && (
                <div
                  className={`mt-4 rounded-xl border p-3 text-sm ${
                    result.is_correct
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  <p className="font-semibold">
                    {result.is_correct ? "✓ Correct" : "✗ Not quite"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{result.feedback}</p>
                  {current.type === "short_answer" && result.correct_answer && (
                    <p className="mt-2 text-xs text-gray-600">
                      <span className="font-medium">Model answer:</span>{" "}
                      {result.correct_answer}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4">
              {!result ? (
                <button
                  onClick={submitAnswer}
                  disabled={
                    grading ||
                    (current.type === "multiple_choice" && selected === null) ||
                    (current.type === "short_answer" && !textAnswer.trim())
                  }
                  className="w-full rounded-lg bg-brand px-3 py-2.5 text-base font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
                >
                  {grading ? "Checking…" : "Submit answer"}
                </button>
              ) : (
                <button
                  onClick={next}
                  className="w-full rounded-lg bg-gray-900 px-3 py-2.5 text-base font-medium text-white transition hover:bg-gray-700"
                >
                  {index + 1 >= questions.length ? "See results" : "Next question"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---- Done ---- */}
        {phase === "done" && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-4xl">
              {correctCount / questions.length >= 0.7 ? "🎉" : "💪"}
            </div>
            <h2 className="mt-3 text-xl font-semibold text-gray-900">
              {correctCount} / {questions.length} correct
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Nice work practicing <strong>{topic}</strong>. Keep going — repetition
              builds understanding.
            </p>
            <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
              <button
                onClick={restart}
                className="w-full rounded-lg bg-brand px-3 py-2.5 text-base font-medium text-white hover:bg-brand-dark"
              >
                New quiz
              </button>
              <Link
                href="/chat"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-base font-medium text-gray-700 hover:bg-gray-100"
              >
                Back to chat
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
