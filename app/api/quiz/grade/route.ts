import { NextResponse, type NextRequest } from "next/server";
import { QUIZ_MODEL } from "@/lib/config";
import { getAnthropic } from "@/lib/ai/anthropic";
import { logEvent } from "@/lib/events";
import { decodeQuestionToken } from "@/lib/quiz-token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function textOf(message: { content: Array<{ type: string; text?: string }> }): string {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

async function gradeShortAnswer(
  question: string,
  modelAnswer: string,
  studentAnswer: string,
): Promise<{ is_correct: boolean; feedback: string }> {
  const anthropic = getAnthropic();
  const system = `You are grading a student's short-answer response for a university unit. Be fair but rigorous. A response is correct if it captures the essential ideas of the model answer, even if worded differently. Partial answers that miss a key idea are not fully correct.

Return ONLY JSON: {"is_correct": true|false, "feedback": "specific, encouraging feedback that points out what was right and what was missing"}.`;

  const user = `Question: ${question}

Model answer / rubric: ${modelAnswer}

Student's answer: ${studentAnswer}

Grade it.`;

  const message = await anthropic.messages.create({
    model: QUIZ_MODEL,
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: user }],
  });

  let text = textOf(message).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const brace = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (brace >= 0 && end > brace) text = text.slice(brace, end + 1);

  try {
    const parsed = JSON.parse(text) as { is_correct?: boolean; feedback?: string };
    return {
      is_correct: Boolean(parsed.is_correct),
      feedback: parsed.feedback ?? "Thanks for your answer.",
    };
  } catch {
    return {
      is_correct: false,
      feedback:
        "I couldn't grade that automatically. Compare your answer with the explanation below.",
    };
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { token?: string; answer?: string | number; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const secret = body.token ? decodeQuestionToken(body.token) : null;
  if (!secret) {
    return NextResponse.json(
      { error: "Invalid or tampered question." },
      { status: 400 },
    );
  }

  let isCorrect = false;
  let feedback = "";
  let correctAnswer: string | null = null;
  const studentAnswerText = String(body.answer ?? "").trim();

  if (secret.type === "multiple_choice") {
    const selected = Number(body.answer);
    isCorrect = Number.isInteger(selected) && selected === secret.correct_index;
    correctAnswer =
      secret.options && secret.correct_index != null
        ? secret.options[secret.correct_index]
        : null;
    feedback = isCorrect
      ? "Correct! " + secret.explanation
      : `Not quite. ${secret.explanation}`;
  } else {
    if (!studentAnswerText) {
      return NextResponse.json(
        { error: "Please write an answer first." },
        { status: 400 },
      );
    }
    const graded = await gradeShortAnswer(
      secret.question,
      secret.model_answer ?? secret.explanation,
      studentAnswerText,
    );
    isCorrect = graded.is_correct;
    feedback = graded.feedback;
    correctAnswer = secret.model_answer ?? null;
  }

  const admin = createSupabaseAdminClient();

  // Persist the attempt.
  await admin.from("quiz_attempts").insert({
    user_id: user.id,
    topic: secret.topic,
    question: secret.question,
    student_answer:
      secret.type === "multiple_choice"
        ? secret.options?.[Number(body.answer)] ?? studentAnswerText
        : studentAnswerText,
    is_correct: isCorrect,
    feedback,
  });

  await logEvent(admin, {
    userId: user.id,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
    type: "quiz_answered",
    payload: { topic: secret.topic, type: secret.type, is_correct: isCorrect },
  });

  return NextResponse.json({
    is_correct: isCorrect,
    feedback,
    correct_answer: correctAnswer,
    explanation: secret.explanation,
  });
}
