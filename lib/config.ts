/**
 * Central configuration for the course AI study assistant.
 *
 * This app is intentionally single-unit. Everything that identifies the unit,
 * the admin, and the allowed student population is read from environment
 * variables here so it can be changed without touching application code.
 *
 * The three values you MUST set for your deployment:
 *   - NEXT_PUBLIC_UNIT
 *   - ADMIN_EMAIL
 *   - NEXT_PUBLIC_ALLOWED_STUDENT_DOMAIN
 *
 * NOTE: the sign-up domain restriction is *also* enforced at the database level
 * (see supabase/migrations) via the `app_config` table. Keep the env values and
 * the seeded DB values in sync.
 */

// Values prefixed with NEXT_PUBLIC_ are safe to expose to the browser.
export const UNIT =
  process.env.NEXT_PUBLIC_UNIT ?? "Data Structures and Algorithms COMP2007";

export const UNIVERSITY = process.env.NEXT_PUBLIC_UNIVERSITY ?? "Curtin University";

/** Only this email can open /admin/analytics. */
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "alfahim2179@gmail.com")
  .trim()
  .toLowerCase();

/**
 * Only emails on this domain (plus the ADMIN_EMAIL) may sign up.
 * Stored with the leading "@" for clarity, e.g. "@student.curtin.edu.au".
 */
export const ALLOWED_STUDENT_DOMAIN = (
  process.env.NEXT_PUBLIC_ALLOWED_STUDENT_DOMAIN ?? "@student.curtin.edu.au"
)
  .trim()
  .toLowerCase();

/** Returns true if `email` is permitted to use the app. */
export function isEmailAllowed(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  if (e === ADMIN_EMAIL) return true;
  const domain = ALLOWED_STUDENT_DOMAIN.startsWith("@")
    ? ALLOWED_STUDENT_DOMAIN
    : `@${ALLOWED_STUDENT_DOMAIN}`;
  return e.endsWith(domain);
}

// ---------------------------------------------------------------------------
// Models (Anthropic). See https://platform.claude.com for current model IDs.
// ---------------------------------------------------------------------------

/** Primary tutor model: fast, high quality, streaming. */
export const CHAT_MODEL = process.env.CHAT_MODEL ?? "claude-sonnet-4-6";

/** "Deep explain" model for hard concepts (UI toggle routes here). */
export const DEEP_MODEL = process.env.DEEP_MODEL ?? "claude-opus-4-8";

/** Model used to generate and grade quizzes. */
export const QUIZ_MODEL = process.env.QUIZ_MODEL ?? "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Embeddings / retrieval
// ---------------------------------------------------------------------------

export const EMBEDDINGS_PROVIDER = process.env.EMBEDDINGS_PROVIDER ?? "voyage";
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "voyage-3-large";
/**
 * Vector dimension. MUST match the `vector(N)` column in the SQL migration.
 * voyage-3-large default output dimension is 1024.
 */
export const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? 1024);

export const RERANK_MODEL = process.env.RERANK_MODEL ?? "rerank-2";

/** Retrieve this many by vector similarity, then rerank down to RERANK_TOP_N. */
export const RETRIEVE_TOP_K = Number(process.env.RETRIEVE_TOP_K ?? 20);
export const RERANK_TOP_N = Number(process.env.RERANK_TOP_N ?? 5);

// ---------------------------------------------------------------------------
// Rate limiting (per user, on the chat endpoint)
// ---------------------------------------------------------------------------

/** Max chat questions per user per rolling window. */
export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 20);
/** Rolling window length, in seconds. */
export const RATE_LIMIT_WINDOW_SECONDS = Number(
  process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60,
);

// ---------------------------------------------------------------------------
// Transcription (local ingestion only)
// ---------------------------------------------------------------------------

/**
 * OpenAI transcription model. whisper-1 supports verbose_json + segment
 * timestamps, which we need so lecture citations can point to a moment in the
 * recording. The gpt-4o-transcribe models do NOT return segment timestamps.
 */
export const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL ?? "whisper-1";

// ---------------------------------------------------------------------------
// Ingestion cost estimate (display only)
// ---------------------------------------------------------------------------

/** USD per 1M embedding tokens, for the ingest cost summary. Voyage-3-large ≈ $0.18/M. */
export const EMBEDDING_USD_PER_MTOK = Number(
  process.env.EMBEDDING_USD_PER_MTOK ?? 0.18,
);
