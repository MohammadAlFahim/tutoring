-- ===========================================================================
-- Course AI Study Assistant — initial schema
-- ===========================================================================
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) for your
-- project. It is idempotent enough to re-run during development.
--
-- IMPORTANT: the vector dimension below (1024) MUST match EMBEDDING_DIM in
-- lib/config.ts (voyage-3-large default output dimension is 1024). If you change
-- the embedding model/dimension, change it in BOTH places and re-ingest.
-- ===========================================================================

-- pgvector for embeddings + similarity search.
create extension if not exists vector;
-- gen_random_uuid()
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- app_config: tiny key/value table. The sign-up domain restriction is enforced
-- at the DB level using these values (see enforce_signup_domain below). Keep
-- these in sync with ADMIN_EMAIL / NEXT_PUBLIC_ALLOWED_STUDENT_DOMAIN env vars.
-- ---------------------------------------------------------------------------
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

-- Seed values. EDIT THESE to match your deployment (or update them later with
-- update public.app_config set value = '...' where key = '...';).
insert into public.app_config (key, value) values
  ('admin_email', 'alfahim2179@gmail.com'),
  ('allowed_student_domain', '@student.curtin.edu.au')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- documents: one row per ingested source file.
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id                uuid primary key default gen_random_uuid(),
  unit              text not null,
  title             text not null,
  source_type       text not null check (source_type in ('slides','notes','recording','textbook')),
  original_filename text not null,
  content_hash      text not null,
  created_at        timestamptz not null default now()
);

create index if not exists documents_unit_idx on public.documents (unit);
create index if not exists documents_hash_idx on public.documents (content_hash);
create unique index if not exists documents_filename_unit_idx
  on public.documents (unit, original_filename);

-- ---------------------------------------------------------------------------
-- chunks: embedded slices of documents. metadata carries page / timestamp /
-- lecture_no etc. so answers can cite a precise location.
-- ---------------------------------------------------------------------------
create table if not exists public.chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  content     text not null,
  embedding   vector(1024) not null,
  metadata    jsonb not null default '{}'::jsonb,
  token_count int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists chunks_document_id_idx on public.chunks (document_id);
-- HNSW index for fast cosine similarity search.
create index if not exists chunks_embedding_hnsw_idx
  on public.chunks using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- events: analytics event log.
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  session_id text,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_user_created_idx on public.events (user_id, created_at);
create index if not exists events_type_created_idx on public.events (type, created_at);

-- ---------------------------------------------------------------------------
-- quiz_attempts: one row per graded question.
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users (id) on delete set null,
  topic          text,
  question       text not null,
  student_answer text,
  is_correct     boolean,
  feedback       text,
  created_at     timestamptz not null default now()
);

create index if not exists quiz_attempts_user_created_idx on public.quiz_attempts (user_id, created_at);
create index if not exists quiz_attempts_topic_idx on public.quiz_attempts (topic);

-- ---------------------------------------------------------------------------
-- chat_messages: per-user chat history (so students keep their history across
-- devices). citations stores the sources shown under an assistant answer.
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  session_id text,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  citations  jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at);

-- ---------------------------------------------------------------------------
-- match_chunks: vector similarity search, filtered to a unit. Returns the
-- citation metadata (document title + source_type) alongside each chunk.
-- ---------------------------------------------------------------------------
create or replace function public.match_chunks(
  query_embedding vector(1024),
  match_count int,
  filter_unit text
)
returns table (
  id           uuid,
  document_id  uuid,
  content      text,
  metadata     jsonb,
  token_count  int,
  source_title text,
  source_type  text,
  similarity   float
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.metadata,
    c.token_count,
    d.title as source_title,
    d.source_type,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where d.unit = filter_unit
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Sign-up domain restriction (enforced at the database level).
-- Allows the admin email and any address on the allowed student domain.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_signup_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  text;
  v_domain text;
  v_email  text := lower(coalesce(new.email, ''));
begin
  select value into v_admin  from public.app_config where key = 'admin_email';
  select value into v_domain from public.app_config where key = 'allowed_student_domain';
  v_admin  := lower(coalesce(v_admin, ''));
  v_domain := lower(coalesce(v_domain, ''));

  if v_email = '' then
    raise exception 'An email address is required to sign up.';
  end if;

  -- Admin always allowed.
  if v_admin <> '' and v_email = v_admin then
    return new;
  end if;

  -- Student domain.
  if v_domain <> '' and v_email like ('%' || v_domain) then
    return new;
  end if;

  raise exception 'Sign-ups are restricted to % addresses.', v_domain
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists enforce_signup_domain_trigger on auth.users;
create trigger enforce_signup_domain_trigger
  before insert on auth.users
  for each row execute function public.enforce_signup_domain();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.app_config     enable row level security;
alter table public.documents      enable row level security;
alter table public.chunks         enable row level security;
alter table public.events         enable row level security;
alter table public.quiz_attempts  enable row level security;
alter table public.chat_messages  enable row level security;

-- app_config: no policies => only the service role can read/write it.

-- documents / chunks: authenticated users may read (for transparency); writes
-- happen only via the service role (ingestion script), which bypasses RLS.
drop policy if exists "documents readable by authenticated" on public.documents;
create policy "documents readable by authenticated"
  on public.documents for select
  to authenticated
  using (true);

drop policy if exists "chunks readable by authenticated" on public.chunks;
create policy "chunks readable by authenticated"
  on public.chunks for select
  to authenticated
  using (true);

-- events: users can insert/read only their own. (Server writes go through the
-- service role and set user_id explicitly; analytics reads use the service role.)
drop policy if exists "events insert own" on public.events;
create policy "events insert own"
  on public.events for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "events select own" on public.events;
create policy "events select own"
  on public.events for select
  to authenticated
  using (auth.uid() = user_id);

-- quiz_attempts: users read only their own.
drop policy if exists "quiz_attempts select own" on public.quiz_attempts;
create policy "quiz_attempts select own"
  on public.quiz_attempts for select
  to authenticated
  using (auth.uid() = user_id);

-- chat_messages: users fully own their own rows.
drop policy if exists "chat_messages select own" on public.chat_messages;
create policy "chat_messages select own"
  on public.chat_messages for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "chat_messages insert own" on public.chat_messages;
create policy "chat_messages insert own"
  on public.chat_messages for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "chat_messages delete own" on public.chat_messages;
create policy "chat_messages delete own"
  on public.chat_messages for delete
  to authenticated
  using (auth.uid() = user_id);
