-- EMBODIED — shared gallery schema.
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
--
-- Stores one row per submitted piece. Scalars are columns (queryable); the two
-- structured blobs (path, locked_cols) are jsonb. The client-generated "u_" id is
-- the primary key so dedupe and the "exclude my own piece" check stay trivial.

create table if not exists public.submissions (
  id          text primary key,                  -- client "u_xxxxxxx"
  emotion     text not null,
  preset_id   text not null,
  locked_cols jsonb not null default '{}'::jsonb,
  path        jsonb not null,
  ts          bigint not null,                    -- client Date.now()
  created_at  timestamptz not null default now()
);

-- The gallery fetches the most recent ~16 pieces; server time avoids client clock skew.
create index if not exists submissions_created_at_idx
  on public.submissions (created_at desc);

-- Row Level Security: anonymous public art piece, no auth.
alter table public.submissions enable row level security;

-- Anyone may read the shared gallery.
create policy "public_select" on public.submissions
  for select to anon using (true);

-- Anyone may submit, but validate the enums and cap the only large field (path).
-- This is a pragmatic, server-function-free guard against malformed/abusive inserts.
create policy "public_insert" on public.submissions
  for insert to anon with check (
    length(id) between 3 and 40
    and emotion   = any (array['Joy','Sadness','Excitement','Anger','Fear'])
    and preset_id = any (array['pulse','roll','arc','scatter','drone'])
    and jsonb_typeof(path) = 'array'
    and jsonb_array_length(path) <= 200
    and pg_column_size(path) < 20000
  );
