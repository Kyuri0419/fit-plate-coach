create table if not exists public.members (
  id uuid primary key,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  share_token text not null unique,
  name text not null,
  goal text not null default '감량',
  weight numeric,
  target_weight numeric,
  notes text default '',
  created_at timestamptz not null default now()
);

alter table public.members
add column if not exists share_token text;

create unique index if not exists members_share_token_key
on public.members(share_token);

create table if not exists public.meals (
  id uuid primary key,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  meal_date date not null,
  meal_type text not null,
  description text not null,
  water numeric,
  dining_out boolean not null default false,
  alcohol boolean not null default false,
  photo_url text default '',
  feedback text default '',
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;
alter table public.meals enable row level security;

drop policy if exists "Trainers can read own members" on public.members;
drop policy if exists "Trainers can insert own members" on public.members;
drop policy if exists "Trainers can update own members" on public.members;
drop policy if exists "Trainers can delete own members" on public.members;

create policy "Trainers can read own members"
on public.members for select
using (auth.uid() = trainer_id);

create policy "Trainers can insert own members"
on public.members for insert
with check (auth.uid() = trainer_id);

create policy "Trainers can update own members"
on public.members for update
using (auth.uid() = trainer_id)
with check (auth.uid() = trainer_id);

create policy "Trainers can delete own members"
on public.members for delete
using (auth.uid() = trainer_id);

drop policy if exists "Trainers can read own meals" on public.meals;
drop policy if exists "Trainers can insert own meals" on public.meals;
drop policy if exists "Trainers can update own meals" on public.meals;
drop policy if exists "Trainers can delete own meals" on public.meals;

create policy "Trainers can read own meals"
on public.meals for select
using (auth.uid() = trainer_id);

create policy "Trainers can insert own meals"
on public.meals for insert
with check (auth.uid() = trainer_id);

create policy "Trainers can update own meals"
on public.meals for update
using (auth.uid() = trainer_id)
with check (auth.uid() = trainer_id);

create policy "Trainers can delete own meals"
on public.meals for delete
using (auth.uid() = trainer_id);

insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Trainers can upload meal photos" on storage.objects;
drop policy if exists "Anyone can view meal photos" on storage.objects;

create policy "Trainers can upload meal photos"
on storage.objects for insert
with check (
  bucket_id = 'meal-photos'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Anyone can view meal photos"
on storage.objects for select
using (bucket_id = 'meal-photos');

drop policy if exists "Members can upload meal photos" on storage.objects;

create policy "Members can upload meal photos"
on storage.objects for insert
with check (
  bucket_id = 'meal-photos'
  and auth.role() = 'anon'
  and (storage.foldername(name))[1] = 'member-uploads'
);

create or replace function public.get_member_by_token(p_share_token text)
returns table (name text)
language sql
security definer
set search_path = public
as $$
  select members.name
  from public.members
  where members.share_token = p_share_token
  limit 1;
$$;

create or replace function public.submit_member_meal(
  p_share_token text,
  p_meal_date date,
  p_meal_type text,
  p_description text,
  p_water numeric,
  p_dining_out boolean,
  p_alcohol boolean,
  p_photo_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member public.members%rowtype;
  new_meal_id uuid := gen_random_uuid();
begin
  select *
  into target_member
  from public.members
  where share_token = p_share_token
  limit 1;

  if target_member.id is null then
    raise exception '유효하지 않은 회원 링크입니다.';
  end if;

  insert into public.meals (
    id,
    trainer_id,
    member_id,
    meal_date,
    meal_type,
    description,
    water,
    dining_out,
    alcohol,
    photo_url
  )
  values (
    new_meal_id,
    target_member.trainer_id,
    target_member.id,
    p_meal_date,
    p_meal_type,
    p_description,
    p_water,
    p_dining_out,
    p_alcohol,
    coalesce(p_photo_url, '')
  );

  return new_meal_id;
end;
$$;

grant execute on function public.get_member_by_token(text) to anon;
grant execute on function public.submit_member_meal(text, date, text, text, numeric, boolean, boolean, text) to anon;
