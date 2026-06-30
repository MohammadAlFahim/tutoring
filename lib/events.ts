import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Canonical analytics event types. Logged throughout the app so the admin can
 * see what students actually do.
 */
export type EventType =
  | "session_start"
  | "question_asked"
  | "answer_completed"
  | "deep_explain_used"
  | "citation_expanded"
  | "quiz_started"
  | "quiz_answered"
  | "quiz_me_clicked";

/**
 * Insert an analytics event using a service-role client (sets user_id
 * explicitly). Never throws — analytics must not break the user experience.
 */
export async function logEvent(
  admin: SupabaseClient,
  params: {
    userId: string | null;
    sessionId?: string | null;
    type: EventType;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("events").insert({
      user_id: params.userId,
      session_id: params.sessionId ?? null,
      type: params.type,
      payload: params.payload ?? {},
    });
  } catch {
    // swallow — logging failures should never surface to the student
  }
}
