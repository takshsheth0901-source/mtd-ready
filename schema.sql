-- ============================================================
-- MTD Ready database. Paste ALL of this into Supabase:
-- SQL Editor > New query > paste > Run.
--
-- The dashboard owner's email is set in is_owner() just below.
-- To change who can log in, edit it there and run this again.
-- ============================================================

create or replace function public.is_owner()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'takshsheth0901@gmail.com'
$$;

-- Accountants you work with
create table if not exists public.partners (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  firm        text,
  email       text,
  phone       text,
  area        text,
  fee         numeric(8,2),          -- what they pay you per signed client
  active      boolean not null default true,
  notes       text
);

-- People who fill in the form on the website
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text not null check (char_length(name) between 1 and 120),
  email         text not null check (char_length(email) between 3 and 200),
  phone         text check (phone is null or char_length(phone) <= 40),
  postcode      text check (postcode is null or char_length(postcode) <= 10),
  who           text check (who in ('st','ll','both','ltd')),
  turnover_band text check (turnover_band is null or char_length(turnover_band) <= 30),
  wants         text check (wants in ('accountant','diy','unsure')),
  message       text check (message is null or char_length(message) <= 1000),
  mtd_result    text check (mtd_result is null or char_length(mtd_result) <= 120),
  consent       boolean not null check (consent = true),
  -- your tracking fields (only you can change these)
  partner_id    uuid references public.partners(id) on delete set null,
  status        text not null default 'new' check (status in ('new','sent','signed','lost')),
  fee_due       numeric(8,2),
  fee_paid      boolean not null default false,
  notes         text
);

alter table public.partners enable row level security;
alter table public.leads    enable row level security;

-- The public website may ADD a lead, but never read, change or delete any.
drop policy if exists "public can submit a lead" on public.leads;
create policy "public can submit a lead" on public.leads
  for insert to anon, authenticated
  with check (status = 'new' and partner_id is null and fee_due is null
              and fee_paid = false and notes is null and consent = true);

-- Only you (logged in with the email above) can see and manage everything.
drop policy if exists "owner manages leads" on public.leads;
create policy "owner manages leads" on public.leads
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner manages partners" on public.partners;
create policy "owner manages partners" on public.partners
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create index if not exists leads_created_idx on public.leads (created_at desc);
