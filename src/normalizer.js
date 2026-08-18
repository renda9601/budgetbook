const crypto = require("crypto");
const { parseMoney } = require("./utils/money");
const { normalizeDate, normalizeTime } = require("./utils/date");

function normalizeRows(rows, importedAt = new Date().toISOString()) {
  const seen = new Set();
  const normalized = [];

  for (const row of rows) {
    const item = normalizeRow(row, importedAt);
    if (!item.transactionDate && !item.description && !item.deposit && !item.withdrawal) continue;
    if (seen.has(item.transactionKey)) continue;
    seen.add(item.transactionKey);
    normalized.push(item);
  }

  return normalized;
}

function normalizeRow(row, importedAt) {
  const dateText = valueFor(row, ["거래일시", "거래일", "일자", "날짜"]);
  const timeText = valueFor(row, ["거래시간", "시간"]);
  const description = valueFor(row, ["거래내용", "내용", "적요", "기재내용"]);
  const withdrawal = parseMoney(valueFor(row, ["출금", "출금액", "지급액", "찾으신금액"]));
  const deposit = parseMoney(valueFor(row, ["입금", "입금액", "맡기신금액"]));
  const balance = parseMoney(valueFor(row, ["잔액", "거래후잔액"]));
  const branch = valueFor(row, ["취급점", "거래점", "점명"]);
  const transactionType = valueFor(row, ["구분", "거래구분", "종류"]);
  const memo = valueFor(row, ["메모", "비고"]);
  const transactionDate = normalizeDate(dateText);
  const transactionTime = normalizeTime(`${dateText} ${timeText}`);

  const keySource = [transactionDate, transactionTime, withdrawal, deposit, balance, description].join("|");
  const transactionKey = crypto.createHash("sha256").update(keySource).digest("hex").slice(0, 32);

  return {
    bank: "woori",
    accountAlias: "",
    transactionDate,
    transactionTime,
    transactionType,
    description,
    withdrawal,
    deposit,
    balance,
    branch,
    memo,
    source: "woori-speed-account",
    importedAt,
    transactionKey
  };
}

function valueFor(row, candidates) {
  for (const candidate of candidates) {
    const key = Object.keys(row).find((name) => normalizeHeader(name).includes(normalizeHeader(candidate)));
    if (key) return String(row[key] || "").trim();
  }
  return "";
}

function normalizeHeader(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

module.exports = { normalizeRows, normalizeRow, valueFor, normalizeHeader };
