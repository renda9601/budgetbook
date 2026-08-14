export const MEMBERS = {
  dad: { login_id: "dad", display_name: "재용", internal_email: "dad@family.local" },
  mom: { login_id: "mom", display_name: "유미", internal_email: "mom@family.local" }
};

export const DEFAULT_CARDS = [
  { id: "card-shinhan", name: "신한카드", issuer: "신한카드", color: "#2563eb" },
  { id: "card-hyundai", name: "현대카드", issuer: "현대카드", color: "#111827" },
  { id: "card-samsung", name: "삼성카드", issuer: "삼성카드", color: "#0ea5e9" }
];

export const DEFAULT_ACCOUNTS = [
  { id: "acc-cash", type: "cash", name: "현금", provider_name: "현금", color: "#16a34a" },
  { id: "acc-local", type: "local_currency", name: "지역화폐", provider_name: "지역화폐", color: "#f97316" },
  { id: "acc-toss", type: "bank", name: "토스뱅크", provider_name: "토스뱅크", color: "#2563eb" },
  { id: "acc-hana", type: "bank", name: "하나은행", provider_name: "하나은행", color: "#059669" },
  { id: "acc-shinhan", type: "bank", name: "신한은행", provider_name: "신한은행", color: "#1d4ed8" },
  { id: "acc-woori", type: "bank", name: "우리은행", provider_name: "우리은행", color: "#0f766e" },
  { id: "acc-nh", type: "bank", name: "농협", provider_name: "농협", color: "#65a30d" }
];

export const DEFAULT_MEMBERS = [
  { id: "member-dad", user_id: null, login_id: "dad", display_name: MEMBERS.dad.display_name, role: "owner", status: "active" },
  { id: "member-mom", user_id: null, login_id: "mom", display_name: MEMBERS.mom.display_name, role: "member", status: "active" }
];

export const DEFAULT_ASSETS = [
  ...DEFAULT_CARDS.map((card, index) => ({
    ...card,
    type: "credit_card",
    legacy_source: "card",
    legacy_id: card.id,
    is_active: true,
    sort_order: index + 1
  })),
  ...DEFAULT_ACCOUNTS.map((account, index) => ({
    ...account,
    type: account.type === "bank" ? "bank_account" : account.type,
    legacy_source: "account",
    legacy_id: account.id,
    is_active: true,
    sort_order: DEFAULT_CARDS.length + index + 1
  }))
];

export const DEFAULT_CATEGORIES = [
  { id: "cat-salary", name: "급여", type: "income", color: "#16a34a" },
  { id: "cat-bonus", name: "상여", type: "income", color: "#22c55e" },
  { id: "cat-income-etc", name: "기타수입", type: "income", color: "#4ade80" },
  "식비,외식,마트/장보기,코스트코,병원/의료,자녀/교육,교우관계/자녀활동비,주유,수소충전,차량정비,보험,대출,관리비,통신비,구독비,생활용품,가전/가구,경조사,투자,비상금,기타"
    .split(",")
    .map((name, index) => ({
      id: `cat-expense-${index + 1}`,
      name,
      type: "expense",
      color: ["#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#059669", "#0d9488", "#0891b2", "#0284c7", "#2563eb", "#4f46e5", "#7c3aed", "#9333ea", "#c026d3", "#db2777", "#e11d48"][index % 16]
    }))
].flat();

export const SAMPLE_TRANSACTIONS = [
  { id: "jun-income-1", transaction_date: "2026-06-25", type: "income", amount: 4088450, payment_method: "bank", account_id: "acc-shinhan", category_id: "cat-salary", merchant: "급여", memo: "6월 급여", owner_user_id: "dad", created_by: "dad", is_fixed: false, is_installment: false },
  { id: "jun-shinhan-1", transaction_date: "2026-06-03", type: "expense", amount: 750000, payment_method: "card", card_id: "card-shinhan", category_id: "cat-expense-3", merchant: "마트/장보기", memo: "", owner_user_id: "mom", created_by: "mom", is_fixed: false, is_installment: false },
  { id: "jun-shinhan-2", transaction_date: "2026-06-08", type: "expense", amount: 420330, payment_method: "card", card_id: "card-shinhan", category_id: "cat-expense-1", merchant: "식비", memo: "", owner_user_id: "mom", created_by: "mom", is_fixed: false, is_installment: false },
  { id: "jun-shinhan-3", transaction_date: "2026-06-13", type: "expense", amount: 533000, payment_method: "card", card_id: "card-shinhan", category_id: "cat-expense-6", merchant: "자녀/교육", memo: "", owner_user_id: "dad", created_by: "dad", is_fixed: false, is_installment: false },
  { id: "jun-shinhan-4", transaction_date: "2026-06-19", type: "expense", amount: 650000, payment_method: "card", card_id: "card-shinhan", category_id: "cat-expense-18", merchant: "경조사", memo: "", owner_user_id: "dad", created_by: "dad", is_fixed: false, is_installment: false },
  { id: "jun-samsung-1", transaction_date: "2026-06-11", type: "expense", amount: 47220, payment_method: "card", card_id: "card-samsung", category_id: "cat-expense-15", merchant: "구독비", memo: "", owner_user_id: "dad", created_by: "dad", is_fixed: false, is_installment: false },
  { id: "jun-hyundai-1", transaction_date: "2026-06-05", type: "expense", amount: 512060, payment_method: "card", card_id: "card-hyundai", category_id: "cat-expense-4", merchant: "코스트코", memo: "", owner_user_id: "mom", created_by: "mom", is_fixed: false, is_installment: false },
  { id: "jun-hyundai-2", transaction_date: "2026-06-16", type: "expense", amount: 390000, payment_method: "card", card_id: "card-hyundai", category_id: "cat-expense-8", merchant: "주유", memo: "", owner_user_id: "dad", created_by: "dad", is_fixed: false, is_installment: false },
  { id: "jun-hyundai-3", transaction_date: "2026-06-22", type: "expense", amount: 400000, payment_method: "card", card_id: "card-hyundai", category_id: "cat-expense-10", merchant: "차량정비", memo: "할부", owner_user_id: "dad", created_by: "dad", is_fixed: false, is_installment: true },
  { id: "jun-fixed-loan", transaction_date: "2026-06-01", type: "expense", amount: 890000, payment_method: "bank", account_id: "acc-hana", category_id: "cat-expense-12", merchant: "대출", memo: "고정비", owner_user_id: "dad", created_by: "dad", is_fixed: true, is_installment: false },
  { id: "jun-fixed-fee", transaction_date: "2026-06-10", type: "expense", amount: 100000, payment_method: "bank", account_id: "acc-woori", category_id: "cat-expense-21", merchant: "영천회비", memo: "고정비", owner_user_id: "mom", created_by: "mom", is_fixed: true, is_installment: false },
  { id: "jun-fixed-reserve", transaction_date: "2026-06-15", type: "expense", amount: 100000, payment_method: "bank", account_id: "acc-toss", category_id: "cat-expense-20", merchant: "비상금", memo: "고정비", owner_user_id: "dad", created_by: "dad", is_fixed: true, is_installment: false },
  { id: "may-shinhan-1", transaction_date: "2026-05-04", type: "expense", amount: 1393118, payment_method: "card", card_id: "card-shinhan", category_id: "cat-expense-3", merchant: "5월 신한", memo: "", owner_user_id: "mom", created_by: "mom", is_fixed: false, is_installment: false },
  { id: "may-samsung-1", transaction_date: "2026-05-12", type: "expense", amount: 87200, payment_method: "card", card_id: "card-samsung", category_id: "cat-expense-15", merchant: "5월 삼성", memo: "", owner_user_id: "dad", created_by: "dad", is_fixed: false, is_installment: false },
  { id: "may-hyundai-1", transaction_date: "2026-05-20", type: "expense", amount: 1870890, payment_method: "card", card_id: "card-hyundai", category_id: "cat-expense-4", merchant: "5월 현대", memo: "", owner_user_id: "dad", created_by: "dad", is_fixed: false, is_installment: false },
  { id: "apr-income-1", transaction_date: "2026-04-25", type: "income", amount: 3980000, payment_method: "bank", account_id: "acc-shinhan", category_id: "cat-salary", merchant: "급여", memo: "", owner_user_id: "dad", created_by: "dad", is_fixed: false, is_installment: false },
  { id: "apr-card-1", transaction_date: "2026-04-15", type: "expense", amount: 2960000, payment_method: "card", card_id: "card-shinhan", category_id: "cat-expense-1", merchant: "4월 카드", memo: "", owner_user_id: "mom", created_by: "mom", is_fixed: false, is_installment: false },
  { id: "apr-fixed-1", transaction_date: "2026-04-01", type: "expense", amount: 980000, payment_method: "bank", account_id: "acc-hana", category_id: "cat-expense-12", merchant: "고정비", memo: "", owner_user_id: "dad", created_by: "dad", is_fixed: true, is_installment: false }
];

export const SAMPLE_FIXED_EXPENSES = [
  { id: "fixed-loan", title: "대출", amount: 890000, category_id: "cat-expense-12", payment_method: "bank", account_id: "acc-hana", due_day: 1, is_active: true, memo: "" },
  { id: "fixed-fee", title: "영천회비", amount: 100000, category_id: "cat-expense-21", payment_method: "bank", account_id: "acc-woori", due_day: 10, is_active: true, memo: "" },
  { id: "fixed-reserve", title: "비상금", amount: 100000, category_id: "cat-expense-20", payment_method: "bank", account_id: "acc-toss", due_day: 15, is_active: true, memo: "" }
];

export const SAMPLE_INSTALLMENTS = [
  { id: "inst-ikea", title: "이케아", total_amount: 600000, monthly_amount: 100000, card_id: "card-hyundai", start_month: "2026-04", end_month: "2026-09", total_months: 6, remaining_months: 3, memo: "" },
  { id: "inst-car", title: "차량 정비", total_amount: 1200000, monthly_amount: 200000, card_id: "card-shinhan", start_month: "2026-06", end_month: "2026-11", total_months: 6, remaining_months: 6, memo: "" }
];
