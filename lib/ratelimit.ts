import {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_SECONDS,
} from "@/lib/config";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Per-user rate limit for the chat endpoint, backed by the events table (so it
 * works across serverless invocations without extra infrastructure). Counts
 * `question_asked` events in the rolling window.
 */
export async function checkChatRateLimit(
  admin: SupabaseClient,
  userId: string,
): Promise<RateLimitResult> {
  const since = new Date(
    Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000,
  ).toISOString();

  const { count, error } = await admin
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "question_asked")
    .gte("created_at", since);

  if (error) {
    // Fail open rather than locking users out on a transient DB error.
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX,
      retryAfterSeconds: 0,
    };
  }

  const used = count ?? 0;
  const allowed = used < RATE_LIMIT_MAX;
  return {
    allowed,
    remaining: Math.max(0, RATE_LIMIT_MAX - used),
    retryAfterSeconds: allowed ? 0 : RATE_LIMIT_WINDOW_SECONDS,
  };
}
