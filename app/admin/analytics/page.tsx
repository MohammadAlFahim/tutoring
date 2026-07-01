import Link from "next/link";
import { redirect } from "next/navigation";
import { ADMIN_EMAIL, UNIT } from "@/lib/config";
import {
  computeAnalytics,
  type RawAttempt,
  type RawEvent,
  type RawUser,
} from "@/lib/analytics";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function fetchAllUsers(): Promise<RawUser[]> {
  const admin = createSupabaseAdminClient();
  const users: RawUser[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      users.push({ id: u.id, email: u.email ?? null, created_at: u.created_at });
    }
    if (data.users.length < 1000) break;
  }
  return users;
}

export default async function AnalyticsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if ((user.email ?? "").toLowerCase() !== ADMIN_EMAIL) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Not authorized</h1>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          The analytics dashboard is restricted to the unit administrator.
        </p>
        <Link
          href="/chat"
          className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          Back to chat
        </Link>
      </main>
    );
  }

  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const [{ data: events }, { data: attempts }, users] = await Promise.all([
    admin
      .from("events")
      .select("user_id, type, payload, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50000),
    admin
      .from("quiz_attempts")
      .select("user_id, topic, is_correct, created_at")
      .gte("created_at", since)
      .limit(50000),
    fetchAllUsers(),
  ]);

  const a = computeAnalytics(
    (events ?? []) as RawEvent[],
    (attempts ?? []) as RawAttempt[],
    users,
  );

  const maxDaily = Math.max(1, ...a.dailyActive.map((d) => d.count));
  const maxTopic = Math.max(1, ...a.topTopics.map((t) => t.count));
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-gray-900">
              Analytics · {UNIT}
            </h1>
            <p className="text-xs text-gray-500">Last 30 days</p>
          </div>
          <Link
            href="/chat"
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            ← Chat
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Sign-ups" value={a.totals.signups} />
          <Stat label="Active (30d)" value={a.totals.activeUsers} />
          <Stat label="DAU" value={a.dau} />
          <Stat label="WAU" value={a.wau} />
          <Stat label="Questions" value={a.totals.questions} />
          <Stat label="Quiz answers" value={a.totals.quizQuestionsAnswered} />
        </section>

        {/* Daily active + Funnel */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Card title="Daily active users (14 days)">
            {a.totals.activeUsers === 0 ? (
              <Empty />
            ) : (
              <div className="flex h-40 items-end gap-1.5">
                {a.dailyActive.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t bg-brand"
                        style={{ height: `${(d.count / maxDaily) * 100}%` }}
                        title={`${d.date}: ${d.count}`}
                      />
                    </div>
                    <span className="text-[9px] text-gray-500">{d.date}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Signup → first question → return">
            <div className="space-y-3 pt-1">
              <FunnelRow
                label="Signed up"
                value={a.funnel.signups}
                base={a.funnel.signups}
              />
              <FunnelRow
                label="Asked ≥1 question"
                value={a.funnel.askedQuestion}
                base={a.funnel.signups}
              />
              <FunnelRow
                label="Returned on a later day"
                value={a.funnel.returned}
                base={a.funnel.signups}
              />
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Retention: {a.retention.returningUsers} of {a.totals.activeUsers}{" "}
              active users came back on a later day ({pct(a.retention.returningRate)}
              ). Avg {a.questionsPerUser.avg.toFixed(1)} questions per active user.
            </p>
          </Card>
        </section>

        {/* Topics + Quiz */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Card title="Most-asked topics">
            {a.topTopics.length === 0 ? (
              <Empty />
            ) : (
              <ul className="space-y-1.5">
                {a.topTopics.map((t) => (
                  <li key={t.term} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-xs text-gray-600">
                      {t.term}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${(t.count / maxTopic) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-xs text-gray-500">
                      {t.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title={`Quiz performance${
              a.quiz.totalAnswered ? ` · ${pct(a.quiz.accuracy)} correct` : ""
            }`}
          >
            {a.quiz.totalAnswered === 0 ? (
              <Empty label="No quiz attempts yet" />
            ) : (
              <ul className="space-y-2">
                {a.quiz.byTopic.map((t) => (
                  <li key={t.topic}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate text-gray-700">{t.topic}</span>
                      <span className="ml-2 shrink-0 text-gray-500">
                        {t.correct}/{t.total} · {pct(t.accuracy)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${
                          t.accuracy >= 0.7
                            ? "bg-green-500"
                            : t.accuracy >= 0.4
                              ? "bg-amber-500"
                              : "bg-red-500"
                        }`}
                        style={{ width: `${t.accuracy * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* Engagement + recent */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Card title="Most engaged students">
            {a.questionsPerUser.top.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-gray-100">
                {a.questionsPerUser.top.map((u) => (
                  <li
                    key={u.email}
                    className="flex items-center justify-between py-1.5 text-xs"
                  >
                    <span className="truncate text-gray-700">{u.email}</span>
                    <span className="ml-2 shrink-0 font-medium text-gray-500">
                      {u.count} questions
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent questions">
            {a.recentQuestions.length === 0 ? (
              <Empty />
            ) : (
              <ul className="space-y-1.5">
                {a.recentQuestions.map((q, i) => (
                  <li key={i} className="text-xs text-gray-600">
                    <span className="text-gray-300">·</span> {q.question}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <p className="pt-2 text-center text-[11px] text-gray-500">
          Deep-explain uses: {a.totals.deepExplains} · Quizzes started:{" "}
          {a.totals.quizzesStarted} · Generated{" "}
          {new Date(a.generatedAt).toLocaleString()}
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </div>
  );
}

function FunnelRow({
  label,
  value,
  base,
}: {
  label: string;
  value: number;
  base: number;
}) {
  const width = base > 0 ? (value / base) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-500">
          {value}
          {base > 0 ? ` · ${Math.round(width)}%` : ""}
        </span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.max(2, width)}%` }}
        />
      </div>
    </div>
  );
}

function Empty({ label = "No data yet" }: { label?: string }) {
  return <p className="py-6 text-center text-xs text-gray-500">{label}</p>;
}
