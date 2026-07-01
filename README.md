# Course AI Study Assistant

A mobile-first chat **study tutor for one university unit**. It knows the unit's
material (RAG over your slides, notes, lecture recordings and textbooks), teaches
Socratically (it won't just complete graded work), cites its sources, generates
and grades practice quizzes, and logs everything so the unit admin can see what
students actually do.

Built with **Next.js (App Router) + TypeScript + Tailwind**, **Supabase**
(Postgres + pgvector + magic-link auth), **Anthropic Claude** (tutor + deep
explain), **Voyage AI** (embeddings + reranking) and **OpenAI** (local lecture
transcription).

---

## How it works

```
Student ──▶ /chat ──▶ /api/chat
                         │ 1. embed question        (Voyage voyage-3-large)
                         │ 2. vector search top-20  (Supabase pgvector)
                         │ 3. rerank → top-5        (Voyage rerank-2)
                         │ 4. grounded prompt + cached tutor system prompt
                         │ 5. stream answer         (Claude Sonnet 4.6 / Opus 4.8)
                         ▼ 6. citations + event logging
```

Lecture **recordings are transcribed locally** by the ingestion script (OpenAI
transcription) — never inside a serverless function, which would time out.

---

## 1. Accounts & API keys you need

| Service | What it's for | Where to get the key |
| --- | --- | --- |
| **Supabase** | Postgres + pgvector + magic-link auth + storage | [supabase.com](https://supabase.com) → New project (region **Sydney / ap-southeast-2**) → Project Settings → **API**: `URL`, `anon` key, `service_role` key |
| **Anthropic** | Tutor chat + deep explain + quiz gen/grading | [console.anthropic.com](https://console.anthropic.com) → **API Keys** |
| **Voyage AI** | Embeddings (`voyage-3-large`) + reranking (`rerank-2`) | [voyageai.com](https://www.voyageai.com) → Dashboard → **API Keys** |
| **OpenAI** | Transcribing lecture recordings (local ingest only) | [platform.openai.com](https://platform.openai.com) → **API Keys** |
| **Vercel** | Hosting | [vercel.com](https://vercel.com) (connect your Git repo) |

---

## 2. Environment variables

Copy the template and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_UNIT` | ✅ | The unit name, e.g. `"Data Structures and Algorithms COMP2007"` |
| `NEXT_PUBLIC_UNIVERSITY` | | Defaults to `Curtin University` |
| `ADMIN_EMAIL` | ✅ | The **only** account that can open `/admin/analytics` |
| `NEXT_PUBLIC_ALLOWED_STUDENT_DOMAIN` | ✅ | Only these emails (plus the admin) can sign up, e.g. `@student.curtin.edu.au` |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **Server-only.** Bypasses RLS — never expose to the browser |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic key |
| `VOYAGE_API_KEY` | ✅ | Voyage key |
| `OPENAI_API_KEY` | ✅ (ingest) | Only needed to run `npm run ingest` |
| `QUIZ_SIGNING_SECRET` | recommended | Signs quiz answer tokens. `openssl rand -hex 32`. Falls back to the service role key if unset |
| `CHAT_MODEL` / `DEEP_MODEL` / `QUIZ_MODEL` | | Override Claude model IDs |
| `EMBEDDING_MODEL` / `EMBEDDING_DIM` / `RERANK_MODEL` | | Override retrieval models. `EMBEDDING_DIM` **must** match the SQL migration's `vector(N)` |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SECONDS` | | Per-user chat rate limit (default 20 / 60s) |

> The three bracketed values from the brief map to: `NEXT_PUBLIC_UNIT`,
> `ADMIN_EMAIL`, and `NEXT_PUBLIC_ALLOWED_STUDENT_DOMAIN`. Change them here (one
> line each) and in the SQL migration's `app_config` seed (below).

---

## 3. Supabase setup

### 3a. Run the migration

In the Supabase dashboard → **SQL Editor**, paste and run
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).

It enables `pgvector`, creates all tables (`documents`, `chunks` with a
`vector(1024)` column + HNSW index, `events`, `quiz_attempts`, `chat_messages`,
`app_config`), the `match_chunks` similarity-search function, the **sign-up
domain trigger**, and Row Level Security policies.

> **Before running it**, edit the two seeded `app_config` values near the top so
> they match your `ADMIN_EMAIL` and `NEXT_PUBLIC_ALLOWED_STUDENT_DOMAIN`. The
> database enforces the domain restriction independently of the app. To change
> them later:
> ```sql
> update public.app_config set value = 'you@uni.edu' where key = 'admin_email';
> update public.app_config set value = '@student.uni.edu' where key = 'allowed_student_domain';
> ```

(If you change the embedding model/dimension, also change `vector(1024)` →
`vector(N)` and the dimension inside `match_chunks`, then re-ingest.)

### 3b. Configure auth (magic links)

In **Authentication → URL Configuration**:

- **Site URL**: your deployed URL (e.g. `https://your-app.vercel.app`).
- **Redirect URLs**: add `http://localhost:3000/**` and
  `https://your-app.vercel.app/**`.

The default magic-link email works out of the box. Supabase's built-in email has
**low rate limits** — for real student traffic, configure **custom SMTP** under
Authentication → Emails.

---

## 4. Add materials & ingest

Drop files into the subfolders (see [`course-materials/README.md`](course-materials/README.md)):

```
course-materials/
├── slides/      *.pdf   (cited as "slide N")
├── notes/       *.docx *.md *.txt
├── recordings/  *.mp3 *.mp4 *.m4a *.wav   (transcribed with timestamps)
└── textbooks/   *.pdf   (cited as "page N")
```

Then run the **local** ingestion pipeline:

```bash
npm install
npm run ingest
```

It parses, transcribes recordings, chunks (~800 tokens, ~100 overlap), embeds via
Voyage and upserts into pgvector. It's **idempotent** — re-running only
re-processes changed files — and prints a summary (documents, chunks, tokens,
estimated embedding cost).

> Naming files like `Lecture 03 - Trees.pdf` lets citations show the lecture
> number. Recordings must be ≤ 25 MB (OpenAI limit) — split larger ones with
> `ffmpeg` first.

---

## 5. Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

`npm run build` for a production build, `npm run typecheck` for types only, and
`npm test` to run the unit suite (chunking, quiz-token signing, analytics, email
gating, prompt building). CI (`.github/workflows/ci.yml`) runs typecheck + tests
+ build on every push and pull request.

---

## 6. Deploy to Vercel

1. Push this repo to GitHub/GitLab and **Import** it in Vercel (framework
   auto-detected as Next.js).
2. Add **all** the environment variables from your `.env.local` under
   **Project Settings → Environment Variables** (every key in the table above
   except the optional ones — `OPENAI_API_KEY` is harmless to include but only
   used by local ingest).
3. Deploy. Then go back to **Supabase → Authentication → URL Configuration** and
   set the **Site URL** + **Redirect URLs** to your Vercel domain.
4. Visit the URL, sign in with an allowed student email, and you're live.

The chat route streams responses; it's configured with `maxDuration = 60`
(Vercel Hobby's limit). On Pro you can raise it.

---

## What's included

- **Auth** — Supabase magic-link login, sign-ups restricted to your student
  domain (enforced both client-side and by a DB trigger). Admin email always allowed.
- **Chat** — mobile-first, streaming, expandable per-answer citations, a
  **Deep explain** toggle (routes to Opus 4.8), a **Quiz me** button, and
  per-user history.
- **Quiz mode** — generates N grounded MC + short-answer questions; MC graded by
  comparison, short answers graded by Claude with specific feedback; correct
  answers never leave the server (HMAC-signed tokens). Every attempt is logged.
- **Analytics** (`/admin/analytics`, admin-only) — sign-ups, DAU/WAU, daily-active
  chart, retention, signup → first-question → return funnel, most-asked topics,
  most-engaged students, recent questions, and quiz accuracy by topic.
- **Tutor system prompt** — used verbatim; Socratic, grounded, and refuses to
  complete graded work.

---

## TODOs / things only you can do

- [ ] Create the five external accounts and paste the keys into `.env.local`
      (and Vercel env vars).
- [ ] Create the Supabase project in **ap-southeast-2 (Sydney)** and run the
      migration (editing the `app_config` seed to your admin email + domain).
- [ ] Set Supabase **Site URL / Redirect URLs** to localhost + your Vercel domain.
- [ ] (Production) configure **custom SMTP** in Supabase for reliable magic-link
      email at scale, and set a dedicated `QUIZ_SIGNING_SECRET`.
- [ ] Drop your real course materials into `/course-materials` and run
      `npm run ingest`.
- [ ] If your unit differs, update `NEXT_PUBLIC_UNIT` — that's the only change
      needed to retarget the whole app.
