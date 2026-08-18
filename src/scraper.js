const selectors = require("../config/selectors");
const logger = require("./utils/logger");

async function collectTransactionRows(page) {
  const target = await findTransactionTable(page);
  if (!target) {
    await printInspection(page);
    throw new Error("거래내역으로 추정되는 표를 찾지 못했습니다.");
  }

  return readTableRows(target.table);
}

async function findTransactionTable(page) {
  const frames = page.frames();
  for (const frame of frames) {
    const tables = await frame.locator("table").elementHandles();
    for (const table of tables) {
      const headers = await getTableHeaders(table);
      if (looksLikeTransactionHeaders(headers)) return { frame, table, headers };
    }
  }
  return null;
}

async function readTableRows(table) {
  const headers = await getTableHeaders(table);
  const rowHandles = await table.$$("tbody tr");
  const rows = [];
  const sourceRows = rowHandles.length ? rowHandles : await table.$$("tr");

  for (const rowHandle of sourceRows) {
    const cells = await rowHandle.$$eval("td, th", (cells) => cells.map((cell) => cell.innerText.trim()));
    if (!cells.length || arraysEqual(cells, headers)) continue;
    const row = {};
    cells.forEach((cell, index) => {
      row[headers[index] || `column${index + 1}`] = cell;
    });
    rows.push(row);
  }

  return rows;
}

async function getTableHeaders(table) {
  const headers = await table.$$eval("thead th, thead td", (cells) => cells.map((cell) => cell.innerText.trim()).filter(Boolean));
  if (headers.length) return headers;
  return table.$$eval("tr:first-child th, tr:first-child td", (cells) => cells.map((cell) => cell.innerText.trim()).filter(Boolean));
}

function looksLikeTransactionHeaders(headers) {
  const joined = headers.join(" ");
  const matched = selectors.tableHeaderHints.filter((hint) => joined.includes(hint));
  return matched.length >= 3 && /입금|출금|잔액/.test(joined);
}

async function printInspection(page) {
  logger.warn("거래내역 표 탐색 실패. 현재 페이지 정보를 출력합니다.");
  logger.warn(`현재 페이지 제목: ${await page.title()}`);
  logger.warn(`현재 URL: ${page.url()}`);

  const visibleText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const warningLines = visibleText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && selectors.stopWarningTexts.some((text) => line.includes(text)))
    .slice(0, 10);
  if (warningLines.length) logger.warn("화면 오류/경고 후보", warningLines);

  const tables = await inspectTables(page);
  logger.warn("접근 가능한 표 헤더 목록", tables);

  const frames = page.frames().map((frame, index) => ({ index, name: frame.name(), url: frame.url() }));
  logger.warn("iframe/frame 목록", frames);
}

async function inspectTables(page) {
  const result = [];
  for (const [frameIndex, frame] of page.frames().entries()) {
    const tables = await frame.locator("table").elementHandles();
    for (const [tableIndex, table] of tables.entries()) {
      result.push({ frameIndex, tableIndex, headers: await getTableHeaders(table) });
    }
  }
  return result;
}

async function inspectPage(page) {
  const frames = page.frames().map((frame, index) => ({ index, name: frame.name(), url: frame.url() }));
  const tables = await inspectTables(page);
  const buttons = [];

  for (const [frameIndex, frame] of page.frames().entries()) {
    const texts = await frame.locator("button, input[type='button'], input[type='submit'], a").evaluateAll((elements) =>
      elements
        .map((element) => element.innerText || element.value || element.getAttribute("title") || element.getAttribute("aria-label") || "")
        .map((text) => text.trim())
        .filter(Boolean)
        .slice(0, 80)
    ).catch(() => []);
    buttons.push({ frameIndex, texts });
  }

  return { title: await page.title(), url: page.url(), frames, tables, buttons };
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

module.exports = {
  collectTransactionRows,
  findTransactionTable,
  readTableRows,
  getTableHeaders,
  inspectPage,
  printInspection
};
