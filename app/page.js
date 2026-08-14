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
  paymentMethodLabel,
  summarizeMonth,
  trendSummary,
  typeLabel
} from "@/lib/calculations";
import { deleteTransaction, fetchHouseholdData, insertTransaction, loadLocalData, saveLocalData, updateTransaction } from "@/lib/dataStore";
import { exportMonthWorkbook } from "@/lib/excelExport";
import {
  assetTypeLabel,
  buildTransactionPayload,
  findTransactionOwner,
  formValuesFromTransaction,
  transactionAssetLabel
} from "@/lib/transactionModel";

const EMPTY_FORM = {
  transaction_date: "",
  type: "expense",
  amount: "",
  from_asset_id: "",
  to_asset_id: "",
  category_id: "",
  merchant: "",
  memo: "",
  owner_member_id: "",
  is_fixed: false,
  is_installment: false
};

const REMEMBER_LOGIN_KEY = "family-budgetbook-remember-login";

export default function Page() {
  const [sessionUser, setSessionUser] = useState(null);
  const [loginId, setLoginId] = useState("dad");
  const [password, setPassword] = useState("");
  const [rememberLoginId, setRememberLoginId] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [month, setMonth] = useState(formatMonth());
  const [view, setView] = useState("dashboard");
  const [data, setData] = useState(loadLocalData);
  const [filters, setFilters] = useState({ type: "all", payment_method: "all", card_id: "all", account_id: "all", category_id: "all", owner_user_id: "all", sort: "desc" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const remembered = loadRememberedLogin();
    if (remembered) {
      setLoginId(remembered.loginId);
      setRememberLoginId(true);
    }

    if (!hasSupabaseConfig) return;
    supabase.auth.getUser().then(async ({ data: authData, error }) => {
      if (error || !authData.user) return;
      const restoredLoginId = authData.user.email?.split("@")[0]?.toLowerCase();
      if (!MEMBERS[restoredLoginId]) return;
      try {
        const householdData = await fetchHouseholdData(restoredLoginId);
        setData(householdData);
        setSessionUser({ ...MEMBERS[restoredLoginId], user_id: authData.user.id });
      } catch (refreshError) {
        setLoginError(toUserMessage(refreshError, "가족 데이터를 불러오지 못했습니다."));
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

  async function refreshData(targetLoginId = sessionUser?.login_id) {
    const householdData = await fetchHouseholdData(targetLoginId);
    setData(householdData);
    return householdData;
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
      saveRememberedLogin(normalized, rememberLoginId);
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
    try {
      const householdData = await refreshData(normalized);
      saveRememberedLogin(normalized, rememberLoginId);
      setSessionUser({ ...MEMBERS[normalized], user_id: householdData.authUserId });
    } catch (refreshError) {
      await supabase.auth.signOut();
      setLoginError(toUserMessage(refreshError, "로그인은 성공했지만 가족 데이터를 불러오지 못했습니다."));
    }
  }

  async function handleLogout() {
    if (hasSupabaseConfig) await supabase.auth.signOut();
    setSessionUser(null);
    setPassword("");
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
    setActionError("");
    setActionMessage("");
    setIsSaving(true);
    try {
      const existing = data.transactions.find((transaction) => transaction.id === editingId);
      const normalized = buildTransactionPayload(form, {
        assets: data.assets,
        members: data.members,
        authUserId: data.authUserId,
        loginId: sessionUser.login_id,
        existing
      });

      if (editingId) {
        const updated = await updateTransaction(editingId, data.householdId, normalized);
        setData((current) => ({
          ...current,
          transactions: current.transactions.map((transaction) => (transaction.id === editingId ? updated : transaction))
        }));
        setActionMessage("거래를 수정했습니다.");
      } else {
        const inserted = await insertTransaction(data.householdId, normalized);
        setData((current) => ({ ...current, transactions: [inserted, ...current.transactions] }));
        setActionMessage("거래를 등록했습니다.");
      }
      setEditingId(null);
      setForm(createDefaultForm(data, sessionUser, month));
    } catch (error) {
      setActionError(toUserMessage(error, "거래를 저장하지 못했습니다."));
    } finally {
      setIsSaving(false);
    }
  }

  async function removeTransaction(id) {
    if (!window.confirm("이 거래를 삭제할까요? 삭제 후에는 화면에서 복구할 수 없습니다.")) return;
    setActionError("");
    setActionMessage("");
    try {
      await deleteTransaction(id, data.householdId);
      setData((current) => ({ ...current, transactions: current.transactions.filter((transaction) => transaction.id !== id) }));
      setActionMessage("거래를 삭제했습니다.");
    } catch (error) {
      setActionError(toUserMessage(error, "거래를 삭제하지 못했습니다."));
    }
  }

  function startEdit(transaction) {
    setEditingId(transaction.id);
    setActionError("");
    setActionMessage("");
    setForm(formValuesFromTransaction(transaction, data.assets, data.members));
    setView("entry");
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
              <input type="checkbox" checked={rememberLoginId} onChange={(event) => setRememberLoginId(event.target.checked)} />
              아이디 기억
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

        {actionError ? <p className="status-message error" role="alert">{actionError}</p> : null}
        {actionMessage ? <p className="status-message success" role="status">{actionMessage}</p> : null}

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

        {view === "entry" && <TransactionForm form={form} setForm={setForm} data={data} sessionUser={sessionUser} onSubmit={submitTransaction} editingId={editingId} isSaving={isSaving} onCancel={() => { setEditingId(null); setForm(createDefaultForm(data, sessionUser, month)); setActionError(""); }} />}

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
      <Select value={filters.owner_user_id} onChange={(value) => setFilters((current) => ({ ...current, owner_user_id: value }))} options={[["all", "전체 사용자"], ...data.members.map((member) => [member.login_id, member.display_name])]} />
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
            {!transactions.length ? <tr><td colSpan="9" className="empty-row">선택한 조건에 맞는 거래가 없습니다.</td></tr> : null}
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.transaction_date}</td>
                <td>{typeLabel(transaction.type)}</td>
                <td>{transactionAssetLabel(transaction, data.assets, data.cards, data.accounts)}</td>
                <td>{data.categories.find((category) => category.id === transaction.category_id)?.name || ""}</td>
                <td>{transaction.merchant}</td>
                <td className={transaction.type === "income" ? "income-text" : "expense-text"}>{money(transaction.amount)}</td>
                <td>{findTransactionOwner(transaction, data.members)?.display_name || transaction.owner_user_id || ""}</td>
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

function TransactionForm({ form, setForm, data, sessionUser, onSubmit, editingId, isSaving, onCancel }) {
  const categories = data.categories.filter((category) => category.type === form.type && category.is_active !== false);
  const assetOptions = data.assets.filter((asset) => asset.is_active !== false).map((asset) => [asset.id, `${asset.name} · ${assetTypeLabel(asset.type)}`]);

  function changeType(type) {
    const firstCategory = data.categories.find((category) => category.type === type && category.is_active !== false)?.id || "";
    const firstAssetId = data.assets.find((asset) => asset.is_active !== false)?.id || "";
    setForm((current) => ({
      ...current,
      type,
      category_id: type === "transfer" ? "" : firstCategory,
      from_asset_id: type === "income" ? "" : current.from_asset_id || firstAssetId,
      to_asset_id: type === "expense"
        ? ""
        : current.to_asset_id && current.to_asset_id !== current.from_asset_id
          ? current.to_asset_id
          : data.assets.find((asset) => asset.is_active !== false && asset.id !== (current.from_asset_id || firstAssetId))?.id || firstAssetId
    }));
  }

  return (
    <section className="panel">
      <h2>{editingId ? "거래 수정" : "거래 등록"}</h2>
      <form className="entry-form" onSubmit={onSubmit}>
        <Field label="거래일"><input type="date" value={form.transaction_date} onChange={(event) => setFormValue(setForm, "transaction_date", event.target.value)} required /></Field>
        <Field label="거래 유형"><Select value={form.type} onChange={changeType} options={[["income", "수입"], ["expense", "지출"], ["transfer", "이체"]]} /></Field>
        <Field label="금액"><input type="number" min="1" step="1" value={form.amount} onChange={(event) => setFormValue(setForm, "amount", event.target.value)} required /></Field>
        {form.type !== "income" ? <Field label={form.type === "transfer" ? "출금 자산" : "결제수단/자산"}><Select value={form.from_asset_id} onChange={(value) => setFormValue(setForm, "from_asset_id", value)} options={assetOptions} /></Field> : null}
        {form.type !== "expense" ? <Field label={form.type === "transfer" ? "입금 자산" : "입금 자산"}><Select value={form.to_asset_id} onChange={(value) => setFormValue(setForm, "to_asset_id", value)} options={assetOptions} /></Field> : null}
        {form.type !== "transfer" ? <Field label="카테고리"><Select value={form.category_id} onChange={(value) => setFormValue(setForm, "category_id", value)} options={categories.map((item) => [item.id, item.name])} /></Field> : null}
        <Field label="사용처"><input value={form.merchant} onChange={(event) => setFormValue(setForm, "merchant", event.target.value)} required /></Field>
        <Field label="사용자"><Select value={form.owner_member_id} onChange={(value) => setFormValue(setForm, "owner_member_id", value)} options={data.members.map((member) => [member.id, member.display_name])} /></Field>
        <Field label="메모"><input value={form.memo} onChange={(event) => setFormValue(setForm, "memo", event.target.value)} /></Field>
        <p className="form-note">입력한 사람: {sessionUser.display_name} · 데이터 출처: 직접 입력</p>
        <label className="check"><input type="checkbox" checked={form.is_fixed} onChange={(event) => setFormValue(setForm, "is_fixed", event.target.checked)} />고정비</label>
        <label className="check"><input type="checkbox" checked={form.is_installment} onChange={(event) => setFormValue(setForm, "is_installment", event.target.checked)} />할부</label>
        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? "저장 중..." : editingId ? "수정 저장" : "등록"}</button>
          {editingId ? <button type="button" onClick={onCancel} disabled={isSaving}>취소</button> : null}
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
  const currentMember = data.members.find((member) => member.login_id === sessionUser?.login_id) || data.members[0];
  const firstAssetId = data.assets.find((asset) => asset.is_active !== false)?.id || "";
  const today = formatMonth() === month ? new Date().toLocaleDateString("en-CA") : `${month}-01`;
  return {
    ...EMPTY_FORM,
    transaction_date: today,
    from_asset_id: firstAssetId,
    to_asset_id: firstAssetId,
    category_id: data.categories.find((category) => category.type === "expense")?.id || "",
    owner_member_id: currentMember?.id || ""
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
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    window.localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify({ loginId: parsed.loginId }));
    return parsed.loginId ? { loginId: parsed.loginId } : null;
  } catch {
    return null;
  }
}

function saveRememberedLogin(loginId, shouldRemember) {
  if (typeof window === "undefined") return;
  if (!shouldRemember) {
    window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
    return;
  }
  window.localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify({ loginId }));
}

function toUserMessage(error, fallback) {
  const message = error?.message || "";
  if (!message) return fallback;
  if (message.includes("row-level security")) return "이 가족 데이터에 접근할 권한이 없습니다.";
  if (message.includes("duplicate key")) return "이미 등록된 데이터와 충돌했습니다.";
  return message;
}
