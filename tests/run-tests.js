const assert = require("assert");
const fs = require("fs/promises");
const http = require("http");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { collectAllPages } = require("../src/pagination");
const { normalizeRows } = require("../src/normalizer");
const { exportCsv } = require("../src/exporters/csvExporter");
const { exportJson } = require("../src/exporters/jsonExporter");

async function run() {
  await testNormalizer();
  await testExporters();
  await testMockScraper();
  console.log("All tests passed");
}

async function testNormalizer() {
  const rows = normalizeRows([
    { 거래일시: "2026.07.20 09:12:05", 거래내용: "마트", 출금액: "12,300원", 입금액: "", 잔액: "1,000,000원" },
    { 거래일시: "2026.07.20 09:12:05", 거래내용: "마트", 출금액: "12,300원", 입금액: "", 잔액: "1,000,000원" },
    { 거래일: "2026-07-19", 거래시간: "18:03", 내용: "급여", 출금: "", 입금: "2,000,000", 잔액: "3,012,300" }
  ], "2026-07-21T00:00:00.000Z");

  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].transactionDate, "2026-07-20");
  assert.strictEqual(rows[0].transactionTime, "09:12:05");
  assert.strictEqual(rows[0].withdrawal, 12300);
  assert.strictEqual(rows[0].deposit, 0);
  assert.strictEqual(rows[1].deposit, 2000000);
}

async function testExporters() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "woori-export-"));
  const rows = normalizeRows([{ 거래일시: "2026.07.20 09:12:05", 거래내용: "마트,테스트", 출금액: "12,300원", 입금액: "", 잔액: "1,000,000원" }]);
  const csvPath = path.join(dir, "out.csv");
  const jsonPath = path.join(dir, "out.json");
  await exportCsv(rows, csvPath);
  await exportJson(rows, jsonPath);
  const csv = await fs.readFile(csvPath, "utf8");
  const json = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  assert(csv.includes("\"마트,테스트\""));
  assert.strictEqual(json.length, 1);
}

async function testMockScraper() {
  const server = await startMockServer();
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(server.url("/woori-page1.html"));
    const rawRows = await collectAllPages(page);
    const rows = normalizeRows(rawRows);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].description, "마트");
    assert.strictEqual(rows[1].description, "급여");
  } finally {
    await browser.close();
    await server.close();
  }
}

async function startMockServer() {
  const root = path.join(__dirname, "mocks");
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const filePath = path.join(root, path.basename(pathname));
    try {
      const html = await fs.readFile(filePath);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: (pathname) => `http://127.0.0.1:${port}${pathname}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
