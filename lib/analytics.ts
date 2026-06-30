/**
 * Pure analytics aggregation. Given raw events / quiz attempts / users, compute
 * the numbers shown on /admin/analytics. Kept dependency-free and testable.
 */

export interface RawEvent {
  user_id: string | null;
  type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}
export interface RawAttempt {
  user_id: string | null;
  topic: string | null;
  is_correct: boolean | null;
  created_at: string;
}
export interface RawUser {
  id: string;
  email: string | null;
  created_at: string;
}

const STOPWORDS = new Set(
  "the a an of to in on for and or is are was were be been do does did how what why when which who whom this that these those with from into about as at by it its it's you your i me my we our can could should would will explain example difference between using use used does what's whats vs help me please give tell show".split(
    /\s+/,
  ),
);

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD (UTC)
}

export interface DailyPoint {
  date: string;
  count: number;
}

export interface AnalyticsSummary {
  generatedAt: string;
  totals: {
    signups: number;
    activeUsers: number;
    questions: number;
    deepExplains: number;
    quizzesStarted: number;
    quizQuestionsAnswered: number;
  };
  dau: number;
  wau: number;
  dailyActive: DailyPoint[];
  retention: {
    returningUsers: number;
    returningRate: number; // 0..1 of users who came back on a later day
  };
  funnel: {
    signups: number;
    askedQuestion: number;
    returned: number;
  };
  questionsPerUser: {
    avg: number;
    top: { email: string; count: number }[];
  };
  topTopics: { term: string; count: number }[];
  recentQuestions: { question: string; at: string }[];
  quiz: {
    totalAnswered: number;
    accuracy: number; // 0..1
    byTopic: { topic: string; total: number; correct: number; accuracy: number }[];
  };
}

export function computeAnalytics(
  events: RawEvent[],
  attempts: RawAttempt[],
  users: RawUser[],
  now: Date = new Date(),
): AnalyticsSummary {
  const emailById = new Map(users.map((u) => [u.id, u.email ?? "(unknown)"]));

  // --- Active days per user (for retention) ---
  const daysByUser = new Map<string, Set<string>>();
  const firstSeen = new Map<string, string>();
  for (const e of events) {
    if (!e.user_id) continue;
    const d = dayKey(e.created_at);
    if (!daysByUser.has(e.user_id)) daysByUser.set(e.user_id, new Set());
    daysByUser.get(e.user_id)!.add(d);
    const cur = firstSeen.get(e.user_id);
    if (!cur || d < cur) firstSeen.set(e.user_id, d);
  }

  const activeUsers = daysByUser.size;
  const returningUsers = [...daysByUser.values()].filter((s) => s.size >= 2).length;

  // --- DAU / WAU ---
  const todayKey = dayKey(now.toISOString());
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const dauSet = new Set<string>();
  const wauSet = new Set<string>();
  for (const e of events) {
    if (!e.user_id) continue;
    if (dayKey(e.created_at) === todayKey) dauSet.add(e.user_id);
    if (e.created_at >= weekAgo) wauSet.add(e.user_id);
  }

  // --- Daily active for the last 14 days ---
  const dailyActive: DailyPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = dayKey(new Date(now.getTime() - i * 86400000).toISOString());
    const set = new Set<string>();
    for (const e of events) {
      if (e.user_id && dayKey(e.created_at) === d) set.add(e.user_id);
    }
    dailyActive.push({ date: d.slice(5), count: set.size });
  }

  // --- Questions ---
  const questionEvents = events.filter((e) => e.type === "question_asked");
  const questionsByUser = new Map<string, number>();
  const termCounts = new Map<string, number>();
  for (const e of questionEvents) {
    if (e.user_id)
      questionsByUser.set(e.user_id, (questionsByUser.get(e.user_id) ?? 0) + 1);
    const q = String(e.payload?.question ?? "");
    for (const raw of q.toLowerCase().split(/[^a-z0-9']+/)) {
      const term = raw.trim();
      if (term.length < 3 || STOPWORDS.has(term)) continue;
      termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
    }
  }

  const topUsers = [...questionsByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({ email: emailById.get(id) ?? id, count }));

  const topTopics = [...termCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([term, count]) => ({ term, count }));

  const recentQuestions = questionEvents
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 12)
    .map((e) => ({
      question: String(e.payload?.question ?? "").slice(0, 160),
      at: e.created_at,
    }));

  const askedUsers = new Set(questionEvents.map((e) => e.user_id).filter(Boolean));

  // --- Quiz performance ---
  const totalAnswered = attempts.length;
  const correct = attempts.filter((a) => a.is_correct).length;
  const byTopicMap = new Map<string, { total: number; correct: number }>();
  for (const a of attempts) {
    const t = (a.topic ?? "(unspecified)").slice(0, 60);
    const cur = byTopicMap.get(t) ?? { total: 0, correct: 0 };
    cur.total += 1;
    if (a.is_correct) cur.correct += 1;
    byTopicMap.set(t, cur);
  }
  const byTopic = [...byTopicMap.entries()]
    .map(([topic, v]) => ({
      topic,
      total: v.total,
      correct: v.correct,
      accuracy: v.total ? v.correct / v.total : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  return {
    generatedAt: now.toISOString(),
    totals: {
      signups: users.length,
      activeUsers,
      questions: questionEvents.length,
      deepExplains: events.filter((e) => e.type === "deep_explain_used").length,
      quizzesStarted: events.filter((e) => e.type === "quiz_started").length,
      quizQuestionsAnswered: totalAnswered,
    },
    dau: dauSet.size,
    wau: wauSet.size,
    dailyActive,
    retention: {
      returningUsers,
      returningRate: activeUsers ? returningUsers / activeUsers : 0,
    },
    funnel: {
      signups: users.length,
      askedQuestion: askedUsers.size,
      returned: returningUsers,
    },
    questionsPerUser: {
      avg: activeUsers ? questionEvents.length / activeUsers : 0,
      top: topUsers,
    },
    topTopics,
    recentQuestions,
    quiz: {
      totalAnswered,
      accuracy: totalAnswered ? correct / totalAnswered : 0,
      byTopic,
    },
  };
}
