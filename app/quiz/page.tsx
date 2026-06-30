import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import QuizClient from "./QuizClient";

export const dynamic = "force-dynamic";

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { topic } = await searchParams;
  return <QuizClient initialTopic={topic ?? ""} />;
}
