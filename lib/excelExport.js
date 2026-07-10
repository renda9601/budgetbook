import ExcelJS from "exceljs";
import { saveAs } from "./saveFile";
import { cardSummary, categorySummary, money, paymentLabel, summarizeMonth, typeLabel } from "./calculations";

export async function exportMonthWorkbook({ month, transactions, cards, accounts, categories, fixedExpenses, installments }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "우리집 가계부";
  workbook.created = new Date();

  const summary = summarizeMonth(transactions, month);
  const cardsByMonth = cardSummary(transactions, month, cards);
  const categoriesByMonth = categorySummary(transactions, month, categories);
  const monthlyTransactions = transactions
    .filter((transaction) => transaction.transaction_date?.slice(0, 7) === month)
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  addSheet(workbook, "월간 요약", [
    ["기준 월", month],
    ["총수입", summary.income],
    ["총지출", summary.expense],
    ["카드 지출", summary.cardExpense],
    ["현금 지출", summary.cashExpense],
    ["지역화폐 지출", summary.localExpense],
    ["은행 출금", summary.bankExpense],
    ["고정비", summary.fixedExpense],
    ["변동비", summary.variableExpense],
    ["잔액/부족금", summary.balance],
    ["전월 대비 증감액", summary.changeAmount],
    ["전월 대비 증감률", Number(summary.changeRate.toFixed(2))]
  ]);

  addSheet(workbook, "거래내역", [
    ["거래일", "거래 유형", "결제수단", "카드사", "은행", "카테고리", "사용처", "금액", "입력자", "고정비 여부", "할부 여부", "메모"],
    ...monthlyTransactions.map((transaction) => [
      new Date(transaction.transaction_date),
      typeLabel(transaction.type),
      paymentLabel(transaction, cards, accounts),
      cards.find((card) => card.id === transaction.card_id)?.name || "",
      accounts.find((account) => account.id === transaction.account_id)?.name || "",
      categories.find((category) => category.id === transaction.category_id)?.name || "",
      transaction.merchant || "",
      Number(transaction.amount || 0),
      transaction.owner_user_id === "mom" ? "유미" : "재용",
      transaction.is_fixed ? "Y" : "N",
      transaction.is_installment ? "Y" : "N",
      transaction.memo || ""
    ])
  ]);

  addSheet(workbook, "카드별 지출", [
    ["카드사", "이번 달", "전월", "증감액"],
    ...cardsByMonth.map((card) => [card.name, card.amount, card.previousAmount, card.changeAmount])
  ]);

  addSheet(workbook, "카테고리별 지출", [
    ["카테고리", "금액"],
    ...categoriesByMonth.map((category) => [category.name, category.amount])
  ]);

  addSheet(workbook, "고정비/할부", [
    ["구분", "항목명", "금액", "카드/계좌", "기간/청구일", "메모"],
    ...fixedExpenses.map((item) => ["고정비", item.title, Number(item.amount || 0), paymentLabel(item, cards, accounts), `매월 ${item.due_day}일`, item.memo || ""]),
    ...installments.map((item) => ["할부", item.title, Number(item.monthly_amount || 0), cards.find((card) => card.id === item.card_id)?.name || "", `${item.start_month}~${item.end_month}`, item.memo || ""])
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `가족가계부_${month}.xlsx`);
}

function addSheet(workbook, name, rows) {
  const sheet = workbook.addWorksheet(name);
  rows.forEach((row) => sheet.addRow(row));
  sheet.columns.forEach((column) => {
    column.width = 18;
    column.eachCell((cell) => {
      if (typeof cell.value === "number") cell.numFmt = "#,##0";
      if (cell.value instanceof Date) cell.numFmt = "yyyy-mm-dd";
    });
  });
  sheet.getRow(1).font = { bold: true };
}
