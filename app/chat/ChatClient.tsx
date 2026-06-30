"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UNIT } from "@/lib/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ChatMessage, Citation } from "@/lib/types";

const EXAMPLE_PROMPTS = [
  "Explain the core idea of this week's topic simply.",
  "Walk me through a worked example step by step.",
  "What's the difference between the two main approaches?",
  "Quiz me on the fundamentals.",
];

export default function ChatClient({
  initialMessages,
  userEmail,
  isAdmin,
}: {
  initialMessages: ChatMessage[];
  userEmail: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [deepExplain, setDeepExplain] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Session id + session_start event (once).
  useEffect(() => {
    sessionIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now());
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "session_start",
        sessionId: sessionIdRef.current,
        payload: { returning: initialMessages.length > 0 },
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll on new content.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming]);

  const postEvent = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, sessionId: sessionIdRef.current, payload }),
      }).catch(() => {});
    },
    [],
  );

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || isStreaming) return;

      setError(null);
      const userMessage: ChatMessage = { role: "user", content: question };
      const sendMessages = [...messages, userMessage];
      setMessages([
        ...sendMessages,
        { role: "assistant", content: "", citations: [] },
      ]);
      setInput("");
      setIsStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: sendMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            deepExplain,
            sessionId: sessionIdRef.current,
          }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Something went wrong.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const updateAssistant = (fn: (m: ChatMessage) => ChatMessage) => {
          setMessages((prev) => {
            const copy = [...prev];
            const i = copy.length - 1;
            if (i >= 0 && copy[i].role === "assistant") copy[i] = fn(copy[i]);
            return copy;
          });
        };

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let evt: { type: string; text?: string; citations?: Citation[]; error?: string };
            try {
              evt = JSON.parse(line);
            } catch {
              continue;
            }
            if (evt.type === "sources") {
              updateAssistant((m) => ({ ...m, citations: evt.citations ?? [] }));
            } else if (evt.type === "text") {
              updateAssistant((m) => ({ ...m, content: m.content + (evt.text ?? "") }));
            } else if (evt.type === "error") {
              setError(evt.error ?? "Something went wrong.");
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        // Drop the empty assistant placeholder on hard failure.
        setMessages((prev) => {
          const copy = [...prev];
          const i = copy.length - 1;
          if (i >= 0 && copy[i].role === "assistant" && !copy[i].content) copy.pop();
          return copy;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [messages, deepExplain, isStreaming],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  function quizMe() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const topic = lastUser?.content?.slice(0, 200) ?? "";
    postEvent("quiz_me_clicked", { topic });
    router.push(`/quiz${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`);
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-gray-900">{UNIT}</h1>
          <p className="truncate text-xs text-gray-400">Study tutor</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={quizMe}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand hover:bg-brand-light"
          >
            Quiz me
          </button>
          {isAdmin && (
            <a
              href="/admin/analytics"
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              Analytics
            </a>
          )}
          <button
            onClick={signOut}
            title={userEmail}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-4">
          {messages.length === 0 ? (
            <EmptyState onPick={(p) => void send(p)} />
          ) : (
            <ul className="space-y-4">
              {messages.map((m, i) => (
                <MessageBubble
                  key={i}
                  message={m}
                  streaming={
                    isStreaming &&
                    i === messages.length - 1 &&
                    m.role === "assistant"
                  }
                  onExpandCitations={() =>
                    postEvent("citation_expanded", {
                      count: m.citations?.length ?? 0,
                    })
                  }
                />
              ))}
            </ul>
          )}
          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-2 flex items-center justify-between">
            <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-gray-600">
              <span
                role="switch"
                aria-checked={deepExplain}
                onClick={() => setDeepExplain((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                  deepExplain ? "bg-brand" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    deepExplain ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </span>
              Deep explain
            </label>
            <button
              onClick={quizMe}
              className="text-xs font-medium text-brand hover:underline"
            >
              Quiz me on this →
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={`Ask anything about ${UNIT}…`}
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition hover:bg-brand-dark disabled:opacity-40"
              aria-label="Send"
            >
              {isStreaming ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
                </svg>
              )}
            </button>
          </form>
          <p className="mt-1.5 text-center text-[11px] text-gray-400">
            Socratic tutor · cites the unit&apos;s materials · won&apos;t complete graded work
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (p: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center pt-10 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-2xl">
        🎓
      </div>
      <h2 className="text-lg font-semibold text-gray-900">
        Ask me anything about {UNIT}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        I&apos;ll help you understand the material with hints, examples, and
        citations — and I can quiz you when you&apos;re ready.
      </p>
      <div className="mt-6 grid w-full max-w-md gap-2">
        {EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm text-gray-700 transition hover:border-brand hover:bg-brand-light"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
  onExpandCitations,
}: {
  message: ChatMessage;
  streaming: boolean;
  onExpandCitations: () => void;
}) {
  const isUser = message.role === "user";
  return (
    <li className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] ${isUser ? "" : "w-full"}`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${
            isUser
              ? "bg-brand text-white"
              : "border border-gray-200 bg-white text-gray-900"
          }`}
        >
          {message.content ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : streaming ? (
            <TypingDots />
          ) : (
            <span className="text-gray-400">…</span>
          )}
        </div>

        {!isUser && message.citations && message.citations.length > 0 && (
          <details
            className="group mt-1.5"
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) onExpandCitations();
            }}
          >
            <summary className="cursor-pointer list-none text-xs font-medium text-gray-500 hover:text-brand">
              <span className="group-open:hidden">
                ▸ {message.citations.length} source
                {message.citations.length > 1 ? "s" : ""}
              </span>
              <span className="hidden group-open:inline">▾ Sources</span>
            </summary>
            <ol className="mt-2 space-y-2">
              {message.citations.map((c) => (
                <li
                  key={c.index}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs"
                >
                  <div className="font-medium text-gray-700">
                    [{c.index}] {c.source_title}
                    <span className="ml-1 font-normal text-gray-400">
                      {[
                        c.lecture_no != null ? `Lecture ${c.lecture_no}` : null,
                        c.page != null
                          ? `${c.source_type === "slides" ? "slide" : "page"} ${c.page}`
                          : null,
                        c.timestamp_label ? `@ ${c.timestamp_label}` : null,
                        c.source_type,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <p className="mt-1 text-gray-500">{c.snippet}</p>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </li>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  );
}
