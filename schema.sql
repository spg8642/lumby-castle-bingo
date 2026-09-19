-- Lumby Castle Bingo Tracker
-- Run this entire script in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  player1 text not null default '',
  player2 text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  position integer not null unique check (position between 1 and 25),
  name text not null,
  points integer not null default 1 check (points >= 0)
);

create table if not exists public.completions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  completed boolean not null default false,
  verified boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(team_id, task_id)
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid()); $$;

alter table public.teams enable row level security;
alter table public.tasks enable row level security;
alter table public.completions enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "public read teams" on public.teams;
create policy "public read teams" on public.teams for select using (true);

drop policy if exists "admins manage teams" on public.teams;
create policy "admins manage teams" on public.teams for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read tasks" on public.tasks;
create policy "public read tasks" on public.tasks for select using (true);

drop policy if exists "admins manage tasks" on public.tasks;
create policy "admins manage tasks" on public.tasks for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read completions" on public.completions;
create policy "public read completions" on public.completions for select using (true);

drop policy if exists "signed users write completions" on public.completions;
create policy "signed users write completions" on public.completions
for insert with check (auth.uid() is not null and updated_by = auth.uid());

drop policy if exists "users update own completion" on public.completions;
create policy "users update own completion" on public.completions
for update using (auth.uid() = updated_by or public.is_admin())
with check ((auth.uid() = updated_by) or public.is_admin());

drop policy if exists "admins delete completions" on public.completions;
create policy "admins delete completions" on public.completions for delete using (public.is_admin());

drop policy if exists "users read admin list" on public.admin_users;
create policy "users read admin list" on public.admin_users for select using (auth.uid() = user_id or public.is_admin());

insert into public.tasks(position,name,points) values
(1,'Task 1',1),(2,'Task 2',1),(3,'Task 3',1),(4,'Task 4',1),(5,'Task 5',1),
(6,'Task 6',1),(7,'Task 7',1),(8,'Task 8',1),(9,'Task 9',1),(10,'Task 10',1),
(11,'Task 11',1),(12,'Task 12',1),(13,'Task 13',1),(14,'Task 14',1),(15,'Task 15',1),
(16,'Task 16',1),(17,'Task 17',1),(18,'Task 18',1),(19,'Task 19',1),(20,'Task 20',1),
(21,'Task 21',1),(22,'Task 22',1),(23,'Task 23',1),(24,'Task 24',1),(25,'Task 25',1)
on conflict(position) do nothing;

-- Example teams. Delete these and add your real teams through the admin UI if desired.
insert into public.teams(name,player1,player2)
select 'Team 1','Player 1','Player 2'
where not exists(select 1 from public.teams);
