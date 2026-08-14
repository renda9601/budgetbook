-- 202608130001 migration 적용 전/후 읽기 전용 검증 SQL
-- 이 파일은 데이터를 변경하지 않으며 db push 대상이 아니다.

-- 1. 기준 테이블 존재 여부
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'households', 'profiles', 'household_members', 'cards', 'accounts',
    'categories', 'transactions', 'fixed_expenses', 'installments',
    'assets', 'import_jobs', 'parser_rules', 'transaction_inbox', 'budgets'
  )
order by table_name;

-- 2. migration 전 보존 기준값: 건수와 유형별 금액
select count(*) as transaction_count from public.transactions;
select
  household_id,
  to_char(transaction_date, 'YYYY-MM') as month,
  type,
  count(*) as transaction_count,
  sum(amount) as amount_sum
from public.transactions
group by household_id, to_char(transaction_date, 'YYYY-MM'), type
order by household_id, month, type;

-- 3. migration을 중단시킬 사전 조건
select c.id as colliding_id
from public.cards c
join public.accounts a on a.id = c.id;

select t.id, t.household_id, t.owner_user_id
from public.transactions t
where t.owner_user_id is not null
  and not exists (
    select 1
    from public.household_members hm
    join public.profiles p on p.user_id = hm.user_id
    where hm.household_id = t.household_id
      and p.login_id = t.owner_user_id
  );

select t.id, t.created_by
from public.transactions t
where t.created_by is not null
  and not exists (
    select 1 from public.profiles p where p.login_id = t.created_by
  );

-- 4. 적용 후 자산/사용자 backfill 검증
-- 아래 쿼리는 신규 열이 생긴 후 주석을 해제해 실행한다.
-- select (select count(*) from public.cards) + (select count(*) from public.accounts) as legacy_asset_count,
--        (select count(*) from public.assets where legacy_source is not null) as migrated_asset_count;
-- select id from public.transactions where owner_user_id is not null and owner_member_id is null;
-- select id from public.transactions where created_by is not null and created_by_user_id is null;
-- select id from public.transactions where type='expense' and (card_id is not null or account_id is not null) and from_asset_id is null;
-- select id from public.transactions where type='income' and (card_id is not null or account_id is not null) and to_asset_id is null;
-- select id, from_asset_id, to_asset_id from public.transactions where type='transfer' and migration_review_required;

-- 5. 적용 후 RLS 상태 검증
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('assets', 'import_jobs', 'parser_rules', 'transaction_inbox', 'budgets')
order by c.relname;

