-- Admin panel v2 — apply manually in Supabase (never npx supabase db push)

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text,
  actor_email text,
  action text not null,
  target text,
  payload jsonb default '{}'::jsonb,
  result text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

create table if not exists public.admin_user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  note text not null,
  author_user_id text,
  author_email text,
  created_at timestamptz not null default now()
);

create index if not exists admin_user_notes_user_id_idx
  on public.admin_user_notes (user_id, created_at desc);

create table if not exists public.admin_agents (
  id text primary key,
  enabled boolean not null default true,
  prompt text not null default '',
  default_prompt text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.admin_agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.admin_agents(id),
  status text not null default 'done',
  summary text,
  proposals jsonb default '[]'::jsonb,
  actor_user_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_agent_proposals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.admin_agent_runs(id) on delete cascade,
  agent_id text not null,
  action text not null,
  payload jsonb default '{}'::jsonb,
  status text not null default 'pending',
  decided_by text,
  decided_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_store_config (
  id text primary key default 'default',
  min_ios_version text,
  min_android_version text,
  force_update boolean not null default false,
  feature_kills jsonb default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.admin_store_config (id)
values ('default')
on conflict (id) do nothing;
