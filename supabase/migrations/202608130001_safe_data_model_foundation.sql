-- 가족 공동 가계부 데이터 모델 1차 비파괴 migration
-- 기준: docs/DATA_MODEL.md
-- 범위: 신규 구조 병행 추가 + 안전하게 결정 가능한 데이터만 backfill
-- 금지: 기존 테이블/열/데이터 삭제, 기존 열 rename, 기존 제약/RLS 제거

begin;

-- 예상한 기존 schema가 아니면 아무 변경도 적용하지 않는다.
do $$
declare
  missing_items text[] := array[]::text[];
begin
  if to_regclass('public.households') is null then missing_items := array_append(missing_items, 'table households'); end if;
  if to_regclass('public.profiles') is null then missing_items := array_append(missing_items, 'table profiles'); end if;
  if to_regclass('public.household_members') is null then missing_items := array_append(missing_items, 'table household_members'); end if;
  if to_regclass('public.cards') is null then missing_items := array_append(missing_items, 'table cards'); end if;
  if to_regclass('public.accounts') is null then missing_items := array_append(missing_items, 'table accounts'); end if;
  if to_regclass('public.categories') is null then missing_items := array_append(missing_items, 'table categories'); end if;
  if to_regclass('public.transactions') is null then missing_items := array_append(missing_items, 'table transactions'); end if;
  if to_regclass('public.fixed_expenses') is null then missing_items := array_append(missing_items, 'table fixed_expenses'); end if;
  if to_regclass('public.installments') is null then missing_items := array_append(missing_items, 'table installments'); end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='owner_user_id') then
    missing_items := array_append(missing_items, 'column transactions.owner_user_id');
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='created_by') then
    missing_items := array_append(missing_items, 'column transactions.created_by');
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='card_id') then
    missing_items := array_append(missing_items, 'column transactions.card_id');
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='account_id') then
    missing_items := array_append(missing_items, 'column transactions.account_id');
  end if;

  if cardinality(missing_items) > 0 then
    raise exception 'Migration stopped: expected schema items are missing: %', array_to_string(missing_items, ', ');
  end if;

  if exists (select 1 from public.cards c join public.accounts a on a.id = c.id) then
    raise exception 'Migration stopped: cards/accounts contain colliding UUID values';
  end if;

  if exists (
    select 1
    from public.transactions t
    where t.owner_user_id is not null
      and not exists (
        select 1
        from public.household_members hm
        join public.profiles p on p.user_id = hm.user_id
        where hm.household_id = t.household_id
          and p.login_id = t.owner_user_id
      )
  ) then
    raise exception 'Migration stopped: one or more transaction owner_user_id values cannot be mapped to a household member';
  end if;

  if exists (
    select 1
    from public.transactions t
    where t.created_by is not null
      and not exists (
        select 1 from public.profiles p where p.login_id = t.created_by
      )
  ) then
    raise exception 'Migration stopped: one or more transaction created_by values cannot be mapped to an Auth user';
  end if;
end $$;

-- 공통 수정 시각 열. 기존 행에는 현재 시각을 채우되 기존 업무 값은 변경하지 않는다.
alter table public.households add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.household_members add column if not exists status text not null default 'active';
alter table public.household_members add column if not exists updated_at timestamptz not null default now();
alter table public.categories add column if not exists is_active boolean not null default true;
alter table public.categories add column if not exists updated_at timestamptz not null default now();

-- 카드와 계좌를 병행 대체할 통합 자산. 기존 cards/accounts는 유지한다.
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check (type in ('cash', 'credit_card', 'bank_account', 'local_currency')),
  name text not null,
  provider_name text,
  owner_member_id uuid references public.household_members(id),
  linked_asset_id uuid references public.assets(id),
  payment_day smallint check (payment_day between 1 and 31),
  color text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  legacy_source text check (legacy_source in ('card', 'account')),
  legacy_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legacy_source, legacy_id)
);

-- 기존 UUID를 그대로 사용해 관계 추적과 rollback을 단순화한다.
insert into public.assets (
  id, household_id, type, name, provider_name, color, is_active,
  sort_order, legacy_source, legacy_id, created_at
)
select
  c.id, c.household_id, 'credit_card', c.name, c.issuer, c.color,
  c.is_active, c.sort_order, 'card', c.id, c.created_at
from public.cards c
on conflict (id) do nothing;

insert into public.assets (
  id, household_id, type, name, provider_name, color, is_active,
  sort_order, legacy_source, legacy_id, created_at
)
select
  a.id,
  a.household_id,
  case a.type when 'bank' then 'bank_account' else a.type end,
  a.name,
  a.provider_name,
  a.color,
  a.is_active,
  a.sort_order,
  'account',
  a.id,
  a.created_at
from public.accounts a
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1
    from public.cards c
    left join public.assets a
      on a.id = c.id and a.legacy_source = 'card' and a.legacy_id = c.id
    where a.id is null
  ) then
    raise exception 'Migration stopped: one or more cards could not be mapped to assets without collision';
  end if;
  if exists (
    select 1
    from public.accounts legacy
    left join public.assets a
      on a.id = legacy.id and a.legacy_source = 'account' and a.legacy_id = legacy.id
    where a.id is null
  ) then
    raise exception 'Migration stopped: one or more accounts could not be mapped to assets without collision';
  end if;
end $$;

-- 가져오기 작업과 검토함. 원본 파일 자체는 저장하지 않는다.
create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source_type text not null check (source_type in ('csv', 'excel', 'sms')),
  source_name text,
  original_filename text,
  status text not null default 'uploaded' check (status in ('uploaded', 'parsing', 'review', 'committed', 'failed', 'cancelled')),
  total_count integer not null default 0 check (total_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  error_summary text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create table if not exists public.parser_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source_type text not null check (source_type in ('csv', 'excel', 'sms')),
  source_name text,
  rule_name text not null,
  version integer not null default 1 check (version > 0),
  mapping jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, source_type, rule_name, version)
);

create table if not exists public.transaction_inbox (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  raw_payload jsonb not null default '{}'::jsonb,
  transaction_date date,
  type text check (type in ('income', 'expense', 'transfer')),
  amount numeric(14, 0) check (amount > 0),
  merchant text,
  memo text,
  owner_member_id uuid references public.household_members(id),
  from_asset_id uuid references public.assets(id),
  to_asset_id uuid references public.assets(id),
  category_id uuid references public.categories(id),
  source_record_id text,
  dedup_key text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'duplicate', 'error', 'accepted', 'rejected')),
  matched_transaction_id uuid references public.transactions(id),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  budget_month date not null check (extract(day from budget_month) = 1),
  category_id uuid not null references public.categories(id),
  owner_member_id uuid references public.household_members(id),
  amount numeric(14, 0) not null check (amount >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기존 문자열/카드/계좌 열은 유지하고 신규 열을 병행 추가한다.
alter table public.transactions add column if not exists owner_member_id uuid references public.household_members(id);
alter table public.transactions add column if not exists usage_scope text not null default 'member';
alter table public.transactions add column if not exists created_by_user_id uuid references auth.users(id);
alter table public.transactions add column if not exists updated_by_user_id uuid references auth.users(id);
alter table public.transactions add column if not exists from_asset_id uuid references public.assets(id);
alter table public.transactions add column if not exists to_asset_id uuid references public.assets(id);
alter table public.transactions add column if not exists source text not null default 'manual';
alter table public.transactions add column if not exists source_record_id text;
alter table public.transactions add column if not exists dedup_key text;
alter table public.transactions add column if not exists import_job_id uuid references public.import_jobs(id);
alter table public.transactions add column if not exists fixed_expense_id uuid references public.fixed_expenses(id);
alter table public.transactions add column if not exists installment_id uuid references public.installments(id);
alter table public.transactions add column if not exists migration_review_required boolean not null default false;

-- 동일 이름의 제약이 이미 있지 않을 때만 신규 값 범위를 추가한다.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.household_members'::regclass and conname='household_members_status_check') then
    alter table public.household_members add constraint household_members_status_check check (status in ('active', 'inactive'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.transactions'::regclass and conname='transactions_usage_scope_check') then
    alter table public.transactions add constraint transactions_usage_scope_check check (usage_scope in ('member', 'common'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.transactions'::regclass and conname='transactions_source_check') then
    alter table public.transactions add constraint transactions_source_check check (source in ('manual', 'csv', 'excel', 'sms', 'other'));
  end if;
end $$;

-- 명확히 결정 가능한 기존 데이터만 backfill한다.
update public.transactions t
set owner_member_id = hm.id
from public.household_members hm
join public.profiles p on p.user_id = hm.user_id
where t.owner_member_id is null
  and t.household_id = hm.household_id
  and t.owner_user_id = p.login_id;

update public.transactions t
set created_by_user_id = p.user_id
from public.profiles p
where t.created_by_user_id is null
  and t.created_by = p.login_id;

update public.transactions
set from_asset_id = coalesce(card_id, account_id)
where type = 'expense'
  and from_asset_id is null
  and (card_id is not null or account_id is not null);

update public.transactions
set to_asset_id = coalesce(card_id, account_id)
where type = 'income'
  and to_asset_id is null
  and (card_id is not null or account_id is not null);

-- 기존 이체는 반대편 자산을 추정하지 않고 검토 대상으로 표시한다.
update public.transactions
set migration_review_required = true
where type = 'transfer'
  and (from_asset_id is null or to_asset_id is null);

-- backfill 결과가 예상과 다르면 전체 migration을 rollback한다.
do $$
begin
  if exists (
    select 1 from public.transactions
    where owner_user_id is not null and owner_member_id is null
  ) then
    raise exception 'Migration stopped: owner member backfill is incomplete';
  end if;
  if exists (
    select 1 from public.transactions
    where created_by is not null and created_by_user_id is null
  ) then
    raise exception 'Migration stopped: created_by Auth UUID backfill is incomplete';
  end if;
  if exists (
    select 1 from public.transactions
    where type='expense' and (card_id is not null or account_id is not null) and from_asset_id is null
  ) then
    raise exception 'Migration stopped: expense asset backfill is incomplete';
  end if;
  if exists (
    select 1 from public.transactions
    where type='income' and (card_id is not null or account_id is not null) and to_asset_id is null
  ) then
    raise exception 'Migration stopped: income asset backfill is incomplete';
  end if;
end $$;

-- 조회 및 중복 검토용 인덱스. 기존 데이터의 중복 여부를 모르므로 unique는 아직 적용하지 않는다.
create index if not exists assets_household_active_sort_idx on public.assets (household_id, is_active, sort_order);
create index if not exists categories_household_type_parent_idx on public.categories (household_id, type, parent_id, is_active, sort_order);
create index if not exists transactions_household_date_idx on public.transactions (household_id, transaction_date desc);
create index if not exists transactions_household_owner_date_idx on public.transactions (household_id, owner_member_id, transaction_date desc);
create index if not exists transactions_household_category_date_idx on public.transactions (household_id, category_id, transaction_date desc);
create index if not exists transactions_household_from_asset_date_idx on public.transactions (household_id, from_asset_id, transaction_date desc);
create index if not exists transactions_household_to_asset_date_idx on public.transactions (household_id, to_asset_id, transaction_date desc);
create index if not exists transactions_household_dedup_idx on public.transactions (household_id, dedup_key) where dedup_key is not null;
create index if not exists import_jobs_household_created_idx on public.import_jobs (household_id, created_at desc);
create index if not exists transaction_inbox_job_status_idx on public.transaction_inbox (import_job_id, status);
create index if not exists budgets_household_month_category_idx on public.budgets (household_id, budget_month, category_id);

-- 수정 시각 trigger를 신규/보강 테이블에도 적용한다.
drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at before update on public.assets for each row execute function public.set_updated_at();
drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists household_members_set_updated_at on public.household_members;
create trigger household_members_set_updated_at before update on public.household_members for each row execute function public.set_updated_at();
drop trigger if exists parser_rules_set_updated_at on public.parser_rules;
create trigger parser_rules_set_updated_at before update on public.parser_rules for each row execute function public.set_updated_at();
drop trigger if exists transaction_inbox_set_updated_at on public.transaction_inbox;
create trigger transaction_inbox_set_updated_at before update on public.transaction_inbox for each row execute function public.set_updated_at();
drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at before update on public.budgets for each row execute function public.set_updated_at();

-- 신규 테이블 RLS. 기존 정책은 제거하거나 넓히지 않는다.
alter table public.assets enable row level security;
alter table public.import_jobs enable row level security;
alter table public.parser_rules enable row level security;
alter table public.transaction_inbox enable row level security;
alter table public.budgets enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='assets' and policyname='assets household access') then
    create policy "assets household access" on public.assets for all
      using (public.is_household_member(household_id))
      with check (public.is_household_member(household_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='import_jobs' and policyname='import jobs household access') then
    create policy "import jobs household access" on public.import_jobs for all
      using (public.is_household_member(household_id))
      with check (public.is_household_member(household_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='parser_rules' and policyname='parser rules household access') then
    create policy "parser rules household access" on public.parser_rules for all
      using (public.is_household_member(household_id))
      with check (public.is_household_member(household_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transaction_inbox' and policyname='transaction inbox household access') then
    create policy "transaction inbox household access" on public.transaction_inbox for all
      using (public.is_household_member(household_id))
      with check (public.is_household_member(household_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='budgets' and policyname='budgets household access') then
    create policy "budgets household access" on public.budgets for all
      using (public.is_household_member(household_id))
      with check (public.is_household_member(household_id));
  end if;
end $$;

commit;
