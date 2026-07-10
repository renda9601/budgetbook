import { DEFAULT_ACCOUNTS, DEFAULT_CARDS, DEFAULT_CATEGORIES } from "./defaultData";

export function formatMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function previousMonth(month) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 2, 1);
  return formatMonth(date);
}

export function recentMonths(month, count = 3) {
  const [year, value] = month.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, value - count + index + 1, 1);
    return formatMonth(date);
  });
}

export function monthLabel(month) {
  const [year, value] = month.split("-");
  return `${year}.${value}`;
}

export function money(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

export function getById(items, id) {
  return items.find((item) => item.id === id);
}

export function inMonth(transaction, month) {
  return transaction.transaction_date?.slice(0, 7) === month;
}

export function filterTransactions(transactions, filters) {
  return transactions.filter((transaction) => {
    if (filters.month && !inMonth(transaction, filters.month)) return false;
    if (filters.type !== "all" && transaction.type !== filters.type) return false;
    if (filters.payment_method !== "all" && transaction.payment_method !== filters.payment_method) return false;
    if (filters.card_id !== "all" && transaction.card_id !== filters.card_id) return false;
    if (filters.account_id !== "all" && transaction.account_id !== filters.account_id) return false;
    if (filters.category_id !== "all" && transaction.category_id !== filters.category_id) return false;
    if (filters.owner_user_id !== "all" && transaction.owner_user_id !== filters.owner_user_id) return false;
    return true;
  });
}

export function summarizeMonth(transactions, month) {
  const current = transactions.filter((transaction) => inMonth(transaction, month));
  const previous = transactions.filter((transaction) => inMonth(transaction, previousMonth(month)));
  const income = sumBy(current, (item) => item.type === "income");
  const expense = sumBy(current, (item) => item.type === "expense");
  const previousExpense = sumBy(previous, (item) => item.type === "expense");
  const changeAmount = expense - previousExpense;
  const changeRate = previousExpense ? (changeAmount / previousExpense) * 100 : 0;
  const cardExpense = sumBy(current, (item) => item.type === "expense" && item.payment_method === "card");
  const cashExpense = sumBy(current, (item) => item.type === "expense" && item.payment_method === "cash");
  const localExpense = sumBy(current, (item) => item.type === "expense" && item.payment_method === "local_currency");
  const bankExpense = sumBy(current, (item) => item.type === "expense" && item.payment_method === "bank");
  const fixedExpense = sumBy(current, (item) => item.type === "expense" && item.is_fixed);

  return {
    month,
    income,
    expense,
    balance: income - expense,
    cardExpense,
    cashExpense,
    localExpense,
    bankExpense,
    fixedExpense,
    variableExpense: expense - fixedExpense,
    previousExpense,
    changeAmount,
    changeRate
  };
}

export function cardSummary(transactions, month, cards = DEFAULT_CARDS) {
  const current = transactions.filter((transaction) => inMonth(transaction, month));
  const previous = transactions.filter((transaction) => inMonth(transaction, previousMonth(month)));
  return cards.map((card) => {
    const amount = sumBy(current, (item) => item.type === "expense" && item.payment_method === "card" && item.card_id === card.id);
    const previousAmount = sumBy(previous, (item) => item.type === "expense" && item.payment_method === "card" && item.card_id === card.id);
    return { ...card, amount, previousAmount, changeAmount: amount - previousAmount };
  });
}

export function categorySummary(transactions, month, categories = DEFAULT_CATEGORIES) {
  const current = transactions.filter((transaction) => inMonth(transaction, month) && transaction.type === "expense");
  return categories
    .filter((category) => category.type === "expense")
    .map((category) => ({
      ...category,
      amount: sumBy(current, (item) => item.category_id === category.id)
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function accountSummary(transactions, month, accounts = DEFAULT_ACCOUNTS) {
  const current = transactions.filter((transaction) => inMonth(transaction, month) && transaction.type === "expense");
  return accounts.map((account) => ({
    ...account,
    amount: sumBy(current, (item) => item.account_id === account.id)
  }));
}

export function trendSummary(transactions, month) {
  return recentMonths(month).map((targetMonth) => {
    const summary = summarizeMonth(transactions, targetMonth);
    return {
      month: monthLabel(targetMonth),
      income: summary.income,
      expense: summary.expense,
      balance: summary.balance,
      cardExpense: summary.cardExpense
    };
  });
}

export function paymentLabel(transaction, cards = DEFAULT_CARDS, accounts = DEFAULT_ACCOUNTS) {
  if (transaction.payment_method === "card") return getById(cards, transaction.card_id)?.name || "신용카드";
  if (transaction.payment_method === "bank") return getById(accounts, transaction.account_id)?.name || "은행";
  if (transaction.payment_method === "local_currency") return "지역화폐";
  return "현금";
}

export function typeLabel(type) {
  return { income: "수입", expense: "지출", transfer: "이체" }[type] || type;
}

export function paymentMethodLabel(value) {
  return { cash: "현금", card: "신용카드", local_currency: "지역화폐", bank: "은행" }[value] || value;
}

function sumBy(items, predicate) {
  return items.reduce((total, item) => total + (predicate(item) ? Number(item.amount || 0) : 0), 0);
}
