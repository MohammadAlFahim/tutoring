/**
 * Server-side environment access with friendly errors.
 *
 * Public values (NEXT_PUBLIC_*) are read directly in lib/config.ts so they can
 * be inlined into the client bundle. The secrets below must never reach the
 * browser and are only imported from server code / scripts.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `See .env.example and the README "Environment variables" section.`,
    );
  }
  return value;
}

export const SUPABASE_URL = () =>
  required("NEXT_PUBLIC_SUPABASE_URL");

export const SUPABASE_ANON_KEY = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const SUPABASE_SERVICE_ROLE_KEY = () =>
  required("SUPABASE_SERVICE_ROLE_KEY");

export const ANTHROPIC_API_KEY = () => required("ANTHROPIC_API_KEY");

export const VOYAGE_API_KEY = () => required("VOYAGE_API_KEY");

export const OPENAI_API_KEY = () => required("OPENAI_API_KEY");

/** Used to sign quiz answer tokens so correct answers never reach the client. */
export const QUIZ_SIGNING_SECRET = () =>
  process.env.QUIZ_SIGNING_SECRET ||
  // Fall back to the service role key so the app still works out of the box,
  // but a dedicated secret is recommended (and documented in .env.example).
  required("SUPABASE_SERVICE_ROLE_KEY");
