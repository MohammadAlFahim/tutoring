import { NextResponse, type NextRequest } from "next/server";
import { QUIZ_MODEL, UNIT } from "@/lib/config";
import { getAnthropic } from "@/lib/ai/anthropic";
import { retrieveContext } from "@/lib/ai/rag";
import { logEvent } from "@/lib/events";
import { encodeQuestionToken } from "@/lib/quiz-token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { QuizQuestionPublic, QuizQuestionSecret } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface GeneratedQuestion {
  type: "multiple_choice" | "short_answer";
  question: string;
  options?: string[];
  correct_index?: number;
  model_answer?: string;
  explanation: string;
}

function textOf(message: { content: Array<{ type: string; text?: string }> }): string {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

function parseQuestions(raw: string): GeneratedQuestion[] {
  let text = raw.trim();
  // Strip markdown fences if the model added them.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // Fall back to the first {...} block.
  if (!text.startsWith("{")) {
    const brace = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (brace >= 0 && end > brace) text = text.slice(brace, end + 1);
  }
  const parsed = JSON.parse(text) as { questions?: GeneratedQuestion[] };
  if (!parsed.questions || !Array.isArray(parsed.questions)) {
    throw new Error("Model did not return a questions array.");
  }
  return parsed.questions;
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { topic?: string; n?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const topic = (body.topic ?? "").trim();
  if (!topic) {
    return NextResponse.json({ error: "A topic is required." }, { status: 400 });
  }
  const n = Math.min(10, Math.max(1, Math.floor(body.n ?? 5)));

  // Retrieve grounding material for the topic.
  const { chunks } = await retrieveContext(topic);
  if (chunks.length === 0) {
    return NextResponse.json(
      {
        error: `I couldn't find anything about "${topic}" in the ${UNIT} materials. Try a different topic or check that materials have been ingested.`,
      },
      { status: 422 },
    );
  }

  const excerpts = chunks
    .map((c, i) => `[${i + 1}] ${c.source_title} — ${c.source_type}\n${c.content}`)
    .join("\n\n---\n\n");

  const system = `You are a quiz author for the unit ${UNIT}. Create practice questions strictly grounded in the provided course material excerpts. Do not test anything not supported by the excerpts.

Return ONLY a JSON object (no prose, no markdown code fences) of the form:
{
  "questions": [
    {
      "type": "multiple_choice",
      "question": "…",
      "options": ["…", "…", "…", "…"],
      "correct_index": 0,
      "explanation": "Why the correct option is correct, referencing the concept."
    },
    {
      "type": "short_answer",
      "question": "…",
      "model_answer": "A concise ideal answer used to grade the student.",
      "explanation": "Key points a good answer must contain."
    }
  ]
}

Rules:
- Produce exactly ${n} questions.
- Use a mix of "multiple_choice" (with exactly 4 options and a correct_index 0-3) and "short_answer".
- Keep questions clear and self-contained. Vary difficulty.
- Every question and answer must be supported by the excerpts.`;

  const userContent = `Topic: ${topic}

Course material excerpts:

${excerpts}

Generate ${n} practice questions on this topic as specified.`;

  let questions: GeneratedQuestion[];
  try {
    const anthropic = getAnthropic();
    const message = await anthropic.messages.create({
      model: QUIZ_MODEL,
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: userContent }],
    });
    questions = parseQuestions(textOf(message));
  } catch (err) {
    console.error("Quiz generation failed:", err);
    return NextResponse.json(
      { error: "Could not generate a quiz right now. Please try again." },
      { status: 500 },
    );
  }

  // Build public questions (no leaked answers) + signed tokens.
  const publicQuestions: QuizQuestionPublic[] = questions
    .filter((q) => q.question && q.explanation)
    .map((q) => {
      const secret: QuizQuestionSecret = {
        type: q.type === "multiple_choice" ? "multiple_choice" : "short_answer",
        question: q.question,
        topic,
        options: q.options,
        correct_index: q.correct_index,
        model_answer: q.model_answer,
        explanation: q.explanation,
      };
      const pub: QuizQuestionPublic = {
        type: secret.type,
        question: q.question,
        options: secret.type === "multiple_choice" ? q.options : undefined,
        token: encodeQuestionToken(secret),
      };
      return pub;
    });

  const admin = createSupabaseAdminClient();
  await logEvent(admin, {
    userId: user.id,
    type: "quiz_started",
    payload: { topic, count: publicQuestions.length },
  });

  return NextResponse.json({ topic, questions: publicQuestions });
}
