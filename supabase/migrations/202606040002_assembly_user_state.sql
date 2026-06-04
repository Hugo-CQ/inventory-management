create table if not exists public.assembly_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.assembly_user_state enable row level security;

drop policy if exists "read own state" on public.assembly_user_state;
create policy "read own state"
on public.assembly_user_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "insert own state" on public.assembly_user_state;
create policy "insert own state"
on public.assembly_user_state
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "update own state" on public.assembly_user_state;
create policy "update own state"
on public.assembly_user_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
