import { NextResponse, type NextRequest } from "next/server";
import { logEvent, type EventType } from "@/lib/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED: EventType[] = [
  "session_start",
  "citation_expanded",
  "quiz_me_clicked",
  "deep_explain_used",
];

/** Lightweight client-side analytics logging. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { type?: string; payload?: Record<string, unknown>; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.type || !ALLOWED.includes(body.type as EventType)) {
    return NextResponse.json({ error: "Unknown event type." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  await logEvent(admin, {
    userId: user.id,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
    type: body.type as EventType,
    payload: body.payload ?? {},
  });

  return NextResponse.json({ ok: true });
}
