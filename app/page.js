"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Download, Home, ListFilter, LogOut, Pencil, Plus, Settings, Trash2, WalletCards } from "lucide-react";
import { hasSupabaseConfig, loginIdToEmail, supabase } from "@/lib/supabaseClient";
import { MEMBERS } from "@/lib/defaultData";
import {
  cardSummary,
  categorySummary,
  filterTransactions,
  formatMonth,
  money,
  paymentLabel,
  paymentMethodLabel,
  summarizeMonth,
  trendSummary,
  typeLabel
} from "@/lib/calculations";
import { deleteTransaction, fetchHouseholdData, insertTransaction, loadLocalData, saveLocalData, updateTransaction } from "@/lib/dataStore";
import { exportMonthWorkbook } from "@/lib/excelExport";

const EMPTY_FORM = {
  transaction_date: "2026-06-30",
  type: "expense",
  amount: "",
  payment_method: "card",
  card_id: "card-shinhan",
  account_id: "",
  category_id: "cat-expense-1",
  merchant: "",
  memo: "",
  owner_user_id: "dad",
  created_by: "dad",
  is_fixed: false,
  is_installment: false
};

const REMEMBER_LOGIN_KEY = "family-budgetbook-remember-login";

export default function Page() {
  const [sessionUser, setSessionUser] = useState(null);
  const [loginId, setLoginId] = useState("dad");
  const [password, setPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [month, setMonth] = useState("2026-06");
  const [view, setView] = useState("dashboard");
  const [data, setData] = useState(loadLocalData);
  const [filters, setFilters] = useState({ type: "all", payment_method: "all", card_id: "all", account_id: "all", category_id: "all", owner_user_id: "all", sort: "desc" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const remembered = loadRememberedLogin();
    if (remembered) {
      setLoginId(remembered.loginId);
      setPassword(remembered.password);
      setRememberPassword(true);
    }

    if (!hasSupabaseConfig) return;
    supabase.auth.getUser().then(({ data: authData }) => {
      if (authData.user) {
        setSessionUser({ login_id: authData.user.email?.split("@")[0], display_name: authData.user.email?.startsWith("mom") ? "유미" : "재용" });
        refreshData();
      }
    });
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig) saveLocalData(data);
  }, [data]);

  useEffect(() => {
    if (editingId) return;
    setForm(createDefaultForm(data, sessionUser, month));
  }, [data, sessionUser, month, editingId]);

  async function refreshData() {
    const householdData = await fetchHouseholdData();
    setData(householdData);
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    const normalized = loginId.trim().toLowerCase();
    if (!MEMBERS[normalized]) {
      setLoginError("dad 또는 mom 아이디만 사용할 수 있습니다.");
      return;
    }

    if (!hasSupabaseConfig) {
      saveRememberedLogin(normalized, password, rememberPassword);
      setSessionUser(MEMBERS[normalized]);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: loginIdToEmail(normalized),
      password
    });
    if (error) {
      setLoginError(error.message);
      return;
    }
    saveRememberedLogin(normalized, password, rememberPassword);
    setSessionUser(MEMBERS[normalized]);
    await refreshData();
  }

  async function handleLogout() {
    if (hasSupabaseConfig) await supabase.auth.signOut();
    setSessionUser(null);
  }

  const summary = useMemo(() => summarizeMonth(data.transactions, month), [data.transactions, month]);
  const cards = useMemo(() => cardSummary(data.transactions, month, data.cards), [data.transactions, month, data.cards]);
  const categories = useMemo(() => categorySummary(data.transactions, month, data.categories), [data.transactions, month, data.categories]);
  const trends = useMemo(() => trendSummary(data.transactions, month), [data.transactions, month]);
  const filteredTransactions = useMemo(() => {
    const list = filterTransactions(data.transactions, { ...filters, month });
    return list.sort((a, b) => (filters.sort === "desc" ? b.transaction_date.localeCompare(a.transaction_date) : a.transaction_date.localeCompare(b.transaction_date)));
  }, [data.transactions, filters, month]);

  async function submitTransaction(event) {
    event.preventDefault();
    const normalized = {
      ...form,
      amount: Number(form.amount),
      card_id: form.payment_method === "card" ? form.card_id : null,
      account_id: form.payment_method !== "card" ? form.account_id || accountForMethod(form.payment_method, data.accounts) : null,
      created_by: sessionUser.login_id,
      owner_user_id: form.owner_user_id
    };

    if (editingId) {
      const updated = await updateTransaction(editingId, normalized);
      setData((current) => ({
        ...current,
        transactions: current.transactions.map((transaction) => (transaction.id === editingId ? updated : transaction))
      }));
    } else {
      const inserted = await insertTransaction(data.householdId, normalized);
      setData((current) => ({ ...current, transactions: [inserted, ...current.transactions] }));
    }
    setEditingId(null);
    setForm(createDefaultForm(data, sessionUser, month));
  }

  async function removeTransaction(id) {
    await deleteTransaction(id);
    setData((current) => ({ ...current, transactions: current.transactions.filter((transaction) => transaction.id !== id) }));
  }

  function startEdit(transaction) {
    setEditingId(transaction.id);
    setForm({ ...EMPTY_FORM, ...transaction, amount: String(transaction.amount), account_id: transaction.account_id || "", card_id: transaction.card_id || "card-shinhan" });
    setView("entry");
  }

  function accountForMethod(method, accounts) {
    const type = method === "local_currency" ? "local_currency" : method === "cash" ? "cash" : "bank";
    return accounts.find((account) => account.type === type)?.id || null;
  }

  if (!sessionUser) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div>
            <p className="eyebrow">우리집 가계부</p>
            <h1>가족 공유 가계부</h1>
            <p className="login-copy">부부가 같은 household 데이터를 함께 관리합니다.</p>
          </div>
          <form onSubmit={handleLogin} className="login-form">
            <label>
              아이디
              <input value={loginId} onChange={(event) => setLoginId(event.target.value)} placeholder="dad 또는 mom" />
            </label>
            <label>
              비밀번호
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={hasSupabaseConfig ? "Supabase 비밀번호" : "데모 모드"} autoComplete="current-password" />
            </label>
            <label className="remember-check">
              <input type="checkbox" checked={rememberPassword} onChange={(event) => setRememberPassword(event.target.checked)} />
              비밀번호 자동저장
            </label>
            {loginError ? <p className="error">{loginError}</p> : null}
            {!hasSupabaseConfig ? <p className="hint">Supabase 환경변수가 없어 샘플 데이터 데모 모드로 실행됩니다.</p> : null}
            <button className="primary-button" type="submit">로그인</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <WalletCards size={24} />
          <strong>우리집 가계부</strong>
        </div>
        <NavButton icon={<Home size={18} />} label="대시보드" active={view === "dashboard"} onClick={() => setView("dashboard")} />
        <NavButton icon={<ListFilter size={18} />} label="거래내역" active={view === "transactions"} onClick={() => setView("transactions")} />
        <NavButton icon={<Plus size={18} />} label="지출 등록" active={view === "entry"} onClick={() => setView("entry")} />
        <NavButton icon={<WalletCards size={18} />} label="고정비/할부" active={view === "fixed"} onClick={() => setView("fixed")} />
        <NavButton icon={<Settings size={18} />} label="설정" active={view === "settings"} onClick={() => setView("settings")} />
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{sessionUser.display_name} 로그인</p>
            <h1>{viewTitle(view)}</h1>
          </div>
          <div className="top-actions">
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            <button className="icon-button" title="선택 월 엑셀 저장" onClick={() => exportMonthWorkbook({ month, ...data })}><Download size={18} /></button>
            <button className="icon-button" title="로그아웃" onClick={handleLogout}><LogOut size={18} /></button>
          </div>
        </header>

        {view === "dashboard" && (
          <>
            <section className="summary-grid">
              <Metric label="총수입" value={money(summary.income)} tone="income" />
              <Metric label="총지출" value={money(summary.expense)} tone="expense" />
              <Metric label="잔액/부족금" value={money(summary.balance)} tone={summary.balance < 0 ? "expense" : "income"} />
              <Metric label="카드 지출" value={money(summary.cardExpense)} />
              <Metric label="현금 지출" value={money(summary.cashExpense)} />
              <Metric label="지역화폐 지출" value={money(summary.localExpense)} />
              <Metric label="은행 출금" value={money(summary.bankExpense)} />
              <Metric label="고정비" value={money(summary.fixedExpense)} />
              <Metric label="변동비" value={money(summary.variableExpense)} />
              <Metric label="전월 대비" value={`${summary.changeAmount >= 0 ? "+" : ""}${money(summary.changeAmount)}`} sub={`${summary.changeRate.toFixed(1)}%`} />
            </section>

            <section className="chart-grid">
              <ChartPanel title="최근 3개월 수입/지출/잔액">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(value) => `${Math.round(value / 10000)}만`} />
                    <Tooltip formatter={(value) => money(value)} />
                    <Legend />
                    <Area dataKey="income" name="수입" stroke="#16a34a" fill="#bbf7d0" />
                    <Area dataKey="expense" name="지출" stroke="#dc2626" fill="#fecaca" />
                    <Area dataKey="balance" name="잔액" stroke="#2563eb" fill="#bfdbfe" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="카드사별 지출">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={cards}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(value) => `${Math.round(value / 10000)}만`} />
                    <Tooltip formatter={(value) => money(value)} />
                    <Bar dataKey="amount" name="이번 달">{cards.map((card) => <Cell key={card.id} fill={card.color} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="카테고리별 지출">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={categories.slice(0, 8)} dataKey="amount" nameKey="name" outerRadius={95} label>
                      {categories.slice(0, 8).map((category) => <Cell key={category.id} fill={category.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => money(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="고정비/변동비">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={[{ name: "비교", fixed: summary.fixedExpense, variable: summary.variableExpense }]}>
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(value) => `${Math.round(value / 10000)}만`} />
                    <Tooltip formatter={(value) => money(value)} />
                    <Legend />
                    <Bar dataKey="fixed" name="고정비" fill="#7c3aed" />
                    <Bar dataKey="variable" name="변동비" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </section>

            <TransactionTable transactions={filteredTransactions.slice(0, 6)} data={data} onEdit={startEdit} onDelete={removeTransaction} />
          </>
        )}

        {view === "transactions" && (
          <>
            <FilterBar filters={filters} setFilters={setFilters} data={data} />
            <TransactionTable transactions={filteredTransactions} data={data} onEdit={startEdit} onDelete={removeTransaction} />
          </>
        )}

        {view === "entry" && (
          <TransactionForm form={form} setForm={setForm} data={data} onSubmit={submitTransaction} editingId={editingId} onCancel={() => { setEditingId(null); setForm(EMPTY_FORM); }} />
        )}

        {view === "fixed" && <FixedInstallmentPanel data={data} />}

        {view === "settings" && (
          <section className="panel">
            <h2>설정</h2>
            <div className="settings-grid">
              <List title="기본 카드사" items={data.cards.map((item) => item.name)} />
              <List title="은행/현금/지역화폐" items={data.accounts.map((item) => item.name)} />
              <List title="구성원" items={["재용 owner", "유미 member"]} />
            </div>
          </section>
        )}
      </section>

      <nav className="bottom-tabs">
        <NavButton icon={<Home size={18} />} label="홈" active={view === "dashboard"} onClick={() => setView("dashboard")} />
        <NavButton icon={<ListFilter size={18} />} label="내역" active={view === "transactions"} onClick={() => setView("transactions")} />
        <NavButton icon={<Plus size={18} />} label="등록" active={view === "entry"} onClick={() => setView("entry")} />
        <NavButton icon={<WalletCards size={18} />} label="통계" active={view === "fixed"} onClick={() => setView("fixed")} />
        <NavButton icon={<Settings size={18} />} label="설정" active={view === "settings"} onClick={() => setView("settings")} />
      </nav>
    </main>
  );
}

function NavButton({ icon, label, active, onClick }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function Metric({ label, value, sub, tone }) {
  return <article className={`metric ${tone || ""}`}><span>{label}</span><strong>{value}</strong>{sub ? <small>{sub}</small> : null}</article>;
}

function ChartPanel({ title, children }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

function FilterBar({ filters, setFilters, data }) {
  return (
    <section className="filter-bar">
      <Select value={filters.type} onChange={(value) => setFilters((current) => ({ ...current, type: value }))} options={[["all", "전체 유형"], ["income", "수입"], ["expense", "지출"], ["transfer", "이체"]]} />
      <Select value={filters.payment_method} onChange={(value) => setFilters((current) => ({ ...current, payment_method: value }))} options={[["all", "전체 결제수단"], ["cash", "현금"], ["card", "신용카드"], ["local_currency", "지역화폐"], ["bank", "은행"]]} />
      <Select value={filters.card_id} onChange={(value) => setFilters((current) => ({ ...current, card_id: value }))} options={[["all", "전체 카드"], ...data.cards.map((item) => [item.id, item.name])]} />
      <Select value={filters.account_id} onChange={(value) => setFilters((current) => ({ ...current, account_id: value }))} options={[["all", "전체 계좌"], ...data.accounts.map((item) => [item.id, item.name])]} />
      <Select value={filters.category_id} onChange={(value) => setFilters((current) => ({ ...current, category_id: value }))} options={[["all", "전체 카테고리"], ...data.categories.map((item) => [item.id, item.name])]} />
      <Select value={filters.owner_user_id} onChange={(value) => setFilters((current) => ({ ...current, owner_user_id: value }))} options={[["all", "전체 입력자"], ["dad", "재용"], ["mom", "유미"]]} />
      <Select value={filters.sort} onChange={(value) => setFilters((current) => ({ ...current, sort: value }))} options={[["desc", "최신순"], ["asc", "오래된순"]]} />
    </section>
  );
}

function Select({ value, onChange, options }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}</select>;
}

function TransactionTable({ transactions, data, onEdit, onDelete }) {
  return (
    <section className="panel table-panel">
      <h2>거래내역</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>거래일</th><th>유형</th><th>결제수단</th><th>카테고리</th><th>사용처</th><th>금액</th><th>입력자</th><th>메모</th><th></th></tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.transaction_date}</td>
                <td>{typeLabel(transaction.type)}</td>
                <td>{paymentLabel(transaction, data.cards, data.accounts)}</td>
                <td>{data.categories.find((category) => category.id === transaction.category_id)?.name || ""}</td>
                <td>{transaction.merchant}</td>
                <td className={transaction.type === "income" ? "income-text" : "expense-text"}>{money(transaction.amount)}</td>
                <td>{transaction.owner_user_id === "mom" ? "유미" : "재용"}</td>
                <td>{transaction.memo}</td>
                <td className="row-actions">
                  <button title="수정" onClick={() => onEdit(transaction)}><Pencil size={16} /></button>
                  <button title="삭제" onClick={() => onDelete(transaction.id)}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TransactionForm({ form, setForm, data, onSubmit, editingId, onCancel }) {
  const expenseCategories = data.categories.filter((category) => category.type === form.type || (form.type === "transfer" && category.type === "expense"));
  return (
    <section className="panel">
      <h2>{editingId ? "거래 수정" : "거래 등록"}</h2>
      <form className="entry-form" onSubmit={onSubmit}>
        <Field label="거래일"><input type="date" value={form.transaction_date} onChange={(event) => setFormValue(setForm, "transaction_date", event.target.value)} required /></Field>
        <Field label="거래 유형"><Select value={form.type} onChange={(value) => setFormValue(setForm, "type", value)} options={[["income", "수입"], ["expense", "지출"], ["transfer", "이체"]]} /></Field>
        <Field label="금액"><input type="number" min="0" value={form.amount} onChange={(event) => setFormValue(setForm, "amount", event.target.value)} required /></Field>
        <Field label="결제수단"><Select value={form.payment_method} onChange={(value) => setFormValue(setForm, "payment_method", value)} options={[["cash", "현금"], ["card", "신용카드"], ["local_currency", "지역화폐"], ["bank", "은행"]]} /></Field>
        {form.payment_method === "card" ? <Field label="카드사"><Select value={form.card_id} onChange={(value) => setFormValue(setForm, "card_id", value)} options={data.cards.map((item) => [item.id, item.name])} /></Field> : null}
        {form.payment_method !== "card" ? <Field label="계좌"><Select value={form.account_id || data.accounts[0]?.id || ""} onChange={(value) => setFormValue(setForm, "account_id", value)} options={data.accounts.map((item) => [item.id, item.name])} /></Field> : null}
        <Field label="카테고리"><Select value={form.category_id} onChange={(value) => setFormValue(setForm, "category_id", value)} options={expenseCategories.map((item) => [item.id, item.name])} /></Field>
        <Field label="사용처"><input value={form.merchant} onChange={(event) => setFormValue(setForm, "merchant", event.target.value)} required /></Field>
        <Field label="입력자"><Select value={form.owner_user_id} onChange={(value) => setFormValue(setForm, "owner_user_id", value)} options={[["dad", "재용"], ["mom", "유미"]]} /></Field>
        <Field label="메모"><input value={form.memo} onChange={(event) => setFormValue(setForm, "memo", event.target.value)} /></Field>
        <label className="check"><input type="checkbox" checked={form.is_fixed} onChange={(event) => setFormValue(setForm, "is_fixed", event.target.checked)} />고정비</label>
        <label className="check"><input type="checkbox" checked={form.is_installment} onChange={(event) => setFormValue(setForm, "is_installment", event.target.checked)} />할부</label>
        <div className="form-actions">
          <button className="primary-button" type="submit">{editingId ? "수정 저장" : "등록"}</button>
          {editingId ? <button type="button" onClick={onCancel}>취소</button> : null}
        </div>
      </form>
    </section>
  );
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function setFormValue(setForm, key, value) {
  setForm((current) => ({ ...current, [key]: value }));
}

function createDefaultForm(data, sessionUser, month) {
  const userId = sessionUser?.login_id || "dad";
  return {
    ...EMPTY_FORM,
    transaction_date: `${month}-01`,
    card_id: data.cards[0]?.id || "",
    account_id: data.accounts.find((account) => account.type === "bank")?.id || data.accounts[0]?.id || "",
    category_id: data.categories.find((category) => category.type === "expense")?.id || "",
    owner_user_id: userId,
    created_by: userId
  };
}

function FixedInstallmentPanel({ data }) {
  return (
    <section className="fixed-grid">
      <div className="panel">
        <h2>고정비</h2>
        {data.fixedExpenses.map((item) => <div className="list-row" key={item.id}><strong>{item.title}</strong><span>{money(item.amount)}</span><small>{paymentMethodLabel(item.payment_method)} · 매월 {item.due_day}일</small></div>)}
      </div>
      <div className="panel">
        <h2>할부</h2>
        {data.installments.map((item) => <div className="list-row" key={item.id}><strong>{item.title}</strong><span>{money(item.monthly_amount)}</span><small>{item.start_month}~{item.end_month} · {item.remaining_months}개월 남음</small></div>)}
      </div>
    </section>
  );
}

function List({ title, items }) {
  return <div className="list-box"><h3>{title}</h3>{items.map((item) => <p key={item}>{item}</p>)}</div>;
}

function viewTitle(view) {
  return { dashboard: "월간 대시보드", transactions: "거래내역", entry: "거래 등록", fixed: "고정비/할부", settings: "설정" }[view];
}

function loadRememberedLogin() {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(REMEMBER_LOGIN_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveRememberedLogin(loginId, password, shouldRemember) {
  if (typeof window === "undefined") return;
  if (!shouldRemember) {
    window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
    return;
  }
  window.localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify({ loginId, password }));
}
