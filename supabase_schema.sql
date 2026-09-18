-- ===== Esquema de base de datos para FitCoach Casa (Supabase) =====
-- Pégalo entero en Supabase → SQL Editor → New query → Run.
-- Usa nombres propios (fc_*) para no chocar con tablas que ya existan en tu
-- proyecto. Una fila por usuario, con RLS: cada usuario solo lee/escribe sus datos.

create table if not exists public.fc_profiles (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.fc_progress (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb,
  updated_at timestamptz default now()
);

alter table public.fc_profiles enable row level security;
alter table public.fc_progress enable row level security;

drop policy if exists "own fc_profile" on public.fc_profiles;
create policy "own fc_profile" on public.fc_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own fc_progress" on public.fc_progress;
create policy "own fc_progress" on public.fc_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
