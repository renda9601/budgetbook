const fs = require("fs/promises");
const path = require("path");

const COLUMNS = [
  "bank",
  "accountAlias",
  "transactionDate",
  "transactionTime",
  "transactionType",
  "description",
  "withdrawal",
  "deposit",
  "balance",
  "branch",
  "memo",
  "source",
  "importedAt",
  "transactionKey"
];

async function exportCsv(rows, filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const lines = [COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map((column) => escapeCsv(row[column])).join(","));
  }
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
  return filePath;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

module.exports = { exportCsv, COLUMNS };
