import { redirect } from "next/navigation";
import { ADMIN_EMAIL } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ChatMessage, Citation } from "@/lib/types";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("chat_messages")
    .select("role, content, citations, created_at")
    .order("created_at", { ascending: true })
    .limit(100);

  const history: ChatMessage[] = (rows ?? []).map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content as string,
    citations: (r.citations as Citation[]) ?? [],
  }));

  const isAdmin = (user.email ?? "").toLowerCase() === ADMIN_EMAIL;

  return (
    <ChatClient
      initialMessages={history}
      userEmail={user.email ?? ""}
      isAdmin={isAdmin}
    />
  );
}
