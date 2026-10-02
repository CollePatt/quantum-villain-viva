-- Scoreboard for Quantum Villain. Run once in the Supabase SQL editor.
-- Only the server (secret / service-role key) reads and writes this table;
-- RLS is on with no policies, so the public anon key cannot touch it.

create table if not exists public.leaderboard_scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 18),
  points integer not null check (points between 0 and 999),
  topic_id text not null,
  level text not null check (level in ('curious', 'physicist')),
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_scores_level_points_idx
  on public.leaderboard_scores (level, points desc, created_at);

alter table public.leaderboard_scores enable row level security;
