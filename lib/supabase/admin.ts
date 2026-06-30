import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Service-role Supabase client. Bypasses Row Level Security.
 *
 * Use ONLY in trusted server contexts (route handlers, the analytics page, the
 * ingestion script) for operations that must read across all users (vector
 * search over chunks, analytics aggregation) or write attributed rows
 * (events / quiz_attempts) where we set user_id explicitly ourselves.
 *
 * NEVER import this from a Client Component.
 */
export function createSupabaseAdminClient() {
  return createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
