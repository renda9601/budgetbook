-- 가족 가계부 최초 schema migration
-- 원본: supabase/schema.sql
-- 신규 family-budgetbook 프로젝트의 기본 구조를 먼저 생성한다.

create extension if not exists "pgcrypto";

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  login_id text not null unique,
  display_name text not null,
  internal_email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  issuer text not null,
  color text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check (type in ('cash', 'bank', 'local_currency')),
  name text not null,
  provider_name text,
  color text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  parent_id uuid references public.categories(id),
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  transaction_date date not null,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount numeric(14, 0) not null check (amount >= 0),
  payment_method text not null check (payment_method in ('cash', 'card', 'local_currency', 'bank')),
  account_id uuid references public.accounts(id),
  card_id uuid references public.cards(id),
  category_id uuid references public.categories(id),
  merchant text,
  memo text,
  owner_user_id text,
  created_by text,
  is_fixed boolean not null default false,
  is_installment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  amount numeric(14, 0) not null check (amount >= 0),
  category_id uuid references public.categories(id),
  payment_method text not null check (payment_method in ('cash', 'card', 'local_currency', 'bank')),
  account_id uuid references public.accounts(id),
  card_id uuid references public.cards(id),
  due_day integer not null check (due_day between 1 and 31),
  is_active boolean not null default true,
  memo text,
  created_at timestamptz not null default now()
);

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  total_amount numeric(14, 0) not null check (total_amount >= 0),
  monthly_amount numeric(14, 0) not null check (monthly_amount >= 0),
  card_id uuid references public.cards(id),
  start_month text not null,
  end_month text not null,
  total_months integer not null,
  remaining_months integer not null,
  memo text,
  created_at timestamptz not null default now()
);

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.household_members enable row level security;
alter table public.cards enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.fixed_expenses enable row level security;
alter table public.installments enable row level security;

create policy "profiles self read" on public.profiles for select using (user_id = auth.uid());
create policy "profiles self update" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "households member read" on public.households for select using (public.is_household_member(id));
create policy "households member insert" on public.households for insert with check (created_by = auth.uid());
create policy "households member update" on public.households for update using (public.is_household_member(id)) with check (public.is_household_member(id));

create policy "household members read" on public.household_members for select using (public.is_household_member(household_id));
create policy "household members manage" on public.household_members for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

create policy "cards household access" on public.cards for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "accounts household access" on public.accounts for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "categories household access" on public.categories for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "transactions household access" on public.transactions for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "fixed expenses household access" on public.fixed_expenses for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "installments household access" on public.installments for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

