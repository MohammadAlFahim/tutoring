import { NextResponse, type NextRequest } from "next/server";
import { CHAT_MODEL, DEEP_MODEL } from "@/lib/config";
import { getAnthropic } from "@/lib/ai/anthropic";
import {
  COURSE_CONTEXT_PREAMBLE,
  TUTOR_SYSTEM_PROMPT,
  buildGroundedUserContent,
} from "@/lib/ai/prompts";
import { retrieveContext } from "@/lib/ai/rag";
import { logEvent } from "@/lib/events";
import { checkChatRateLimit } from "@/lib/ratelimit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const encoder = new TextEncoder();
function ndjson(obj: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(obj) + "\n");
}

export async function POST(request: NextRequest) {
  // --- Auth ---------------------------------------------------------------
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // --- Parse --------------------------------------------------------------
  let body: { messages?: ChatMessage[]; deepExplain?: boolean; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const deepExplain = Boolean(body.deepExplain);
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  const last = messages[messages.length - 1];

  if (!last || last.role !== "user" || !last.content?.trim()) {
    return NextResponse.json(
      { error: "The last message must be a non-empty user message." },
      { status: 400 },
    );
  }
  // Bound question length to protect against abuse / runaway cost.
  const question = last.content.trim().slice(0, 4000);

  const admin = createSupabaseAdminClient();

  // Log the question FIRST, then rate-limit on a count that includes this row.
  // Logging before counting means concurrent requests from the same user each
  // see each other's rows, which bounds the classic check-then-act race to at
  // most a small overshoot instead of letting a burst all pass at once.
  await logEvent(admin, {
    userId: user.id,
    sessionId,
    type: "question_asked",
    payload: {
      deep_explain: deepExplain,
      model: deepExplain ? DEEP_MODEL : CHAT_MODEL,
      length: question.length,
      question: question.slice(0, 500),
    },
  });

  // --- Rate limit (count is inclusive of the event just logged) -----------
  const rl = await checkChatRateLimit(admin, user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `You're sending questions a bit fast. Please wait ~${rl.retryAfterSeconds}s and try again.`,
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  if (deepExplain) {
    await logEvent(admin, {
      userId: user.id,
      sessionId,
      type: "deep_explain_used",
      payload: { question: question.slice(0, 200) },
    });
  }

  // Persist the user's message to history now (survives a generation failure).
  await admin.from("chat_messages").insert({
    user_id: user.id,
    session_id: sessionId,
    role: "user",
    content: question,
    citations: [],
  });

  // --- Retrieve + rerank --------------------------------------------------
  let retrieval;
  try {
    retrieval = await retrieveContext(question);
  } catch (err) {
    console.error("Retrieval failed:", err);
    return NextResponse.json(
      { error: "Could not search the course materials right now." },
      { status: 500 },
    );
  }
  const { chunks, citations } = retrieval;

  // --- Build the grounded prompt -----------------------------------------
  // Keep only the most recent turns (bounds cost/latency and request size), then
  // ensure the sequence still starts with a user message for the Anthropic API.
  let history = messages
    .slice(0, -1)
    .slice(-24)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    // Never forward an empty/whitespace-only message — the model rejects empty
    // text blocks, and a stale blank assistant placeholder could otherwise wedge
    // the whole conversation.
    .filter((m) => m.content.trim().length > 0);
  while (history.length && history[0].role !== "user") history = history.slice(1);

  const apiMessages = [
    ...history,
    { role: "user" as const, content: buildGroundedUserContent(question, chunks) },
  ];

  const model = deepExplain ? DEEP_MODEL : CHAT_MODEL;
  const anthropic = getAnthropic();

  // --- Stream -------------------------------------------------------------
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(ndjson({ type: "sources", citations }));

      let full = "";
      try {
        const stream = anthropic.messages.stream({
          model,
          max_tokens: deepExplain ? 4000 : 1500,
          // Stable prefix (system prompt + course-context preamble) is cached.
          system: [
            { type: "text", text: TUTOR_SYSTEM_PROMPT },
            {
              type: "text",
              text: COURSE_CONTEXT_PREAMBLE,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: apiMessages,
        });

        stream.on("text", (delta) => {
          full += delta;
          controller.enqueue(ndjson({ type: "text", text: delta }));
        });

        await stream.finalMessage();

        await admin.from("chat_messages").insert({
          user_id: user.id,
          session_id: sessionId,
          role: "assistant",
          content: full,
          citations,
        });
        await logEvent(admin, {
          userId: user.id,
          sessionId,
          type: "answer_completed",
          payload: { model, chars: full.length, sources: citations.length },
        });

        controller.enqueue(ndjson({ type: "done" }));
      } catch (err) {
        console.error("Generation failed:", err);
        controller.enqueue(
          ndjson({
            type: "error",
            error: "Sorry — something went wrong generating a response.",
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
