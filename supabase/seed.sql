do $$
declare
  dad_user_id uuid;
  mom_user_id uuid;
  home_id uuid;
begin
  select id into dad_user_id from auth.users where email = 'dad@family.local';
  select id into mom_user_id from auth.users where email = 'mom@family.local';

  if dad_user_id is null or mom_user_id is null then
    raise exception 'Create auth users dad@family.local and mom@family.local before running seed.sql';
  end if;

  insert into public.households (name, created_by)
  values ('우리집 가계부', dad_user_id)
  returning id into home_id;

  insert into public.profiles (user_id, login_id, display_name, internal_email)
  values
    (dad_user_id, 'dad', '재용', 'dad@family.local'),
    (mom_user_id, 'mom', '유미', 'mom@family.local')
  on conflict (user_id) do update set
    login_id = excluded.login_id,
    display_name = excluded.display_name,
    internal_email = excluded.internal_email;

  insert into public.household_members (household_id, user_id, display_name, role)
  values
    (home_id, dad_user_id, '아빠', 'owner'),
    (home_id, mom_user_id, '엄마', 'member')
  on conflict (household_id, user_id) do nothing;

  insert into public.cards (household_id, name, issuer, color, sort_order)
  values
    (home_id, '신한카드', '신한카드', '#2563eb', 1),
    (home_id, '현대카드', '현대카드', '#111827', 2),
    (home_id, '삼성카드', '삼성카드', '#0ea5e9', 3);

  insert into public.accounts (household_id, type, name, provider_name, color, sort_order)
  values
    (home_id, 'cash', '현금', '현금', '#16a34a', 1),
    (home_id, 'local_currency', '지역화폐', '지역화폐', '#f97316', 2),
    (home_id, 'bank', '토스뱅크', '토스뱅크', '#2563eb', 3),
    (home_id, 'bank', '하나은행', '하나은행', '#059669', 4),
    (home_id, 'bank', '신한은행', '신한은행', '#1d4ed8', 5),
    (home_id, 'bank', '우리은행', '우리은행', '#0f766e', 6),
    (home_id, 'bank', '농협', '농협', '#65a30d', 7);

  insert into public.categories (household_id, name, type, color, sort_order)
  values
    (home_id, '급여', 'income', '#16a34a', 1),
    (home_id, '상여', 'income', '#22c55e', 2),
    (home_id, '기타수입', 'income', '#4ade80', 3),
    (home_id, '식비', 'expense', '#dc2626', 101),
    (home_id, '외식', 'expense', '#ea580c', 102),
    (home_id, '마트/장보기', 'expense', '#d97706', 103),
    (home_id, '코스트코', 'expense', '#ca8a04', 104),
    (home_id, '병원/의료', 'expense', '#65a30d', 105),
    (home_id, '자녀/교육', 'expense', '#059669', 106),
    (home_id, '교우관계/자녀활동비', 'expense', '#0d9488', 107),
    (home_id, '주유', 'expense', '#0891b2', 108),
    (home_id, '수소충전', 'expense', '#0284c7', 109),
    (home_id, '차량정비', 'expense', '#2563eb', 110),
    (home_id, '보험', 'expense', '#4f46e5', 111),
    (home_id, '대출', 'expense', '#7c3aed', 112),
    (home_id, '관리비', 'expense', '#9333ea', 113),
    (home_id, '통신비', 'expense', '#c026d3', 114),
    (home_id, '구독비', 'expense', '#db2777', 115),
    (home_id, '생활용품', 'expense', '#e11d48', 116),
    (home_id, '가전/가구', 'expense', '#dc2626', 117),
    (home_id, '경조사', 'expense', '#ea580c', 118),
    (home_id, '투자', 'expense', '#d97706', 119),
    (home_id, '비상금', 'expense', '#ca8a04', 120),
    (home_id, '기타', 'expense', '#65a30d', 121);
end $$;
