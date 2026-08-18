const path = require("path");
const readline = require("readline/promises");
const { stdin: input, stdout: output } = require("process");
const selectors = require("../config/selectors");
const { launchBrowser, createPage, latestPage } = require("./browser");
const { inspectPage } = require("./scraper");
const { collectAllPages } = require("./pagination");
const { normalizeRows } = require("./normalizer");
const { exportCsv } = require("./exporters/csvExporter");
const { exportJson } = require("./exporters/jsonExporter");
const { fileTimestamp } = require("./utils/date");
const logger = require("./utils/logger");

async function main() {
  const inspectOnly = process.argv.includes("--inspect");
  const rl = readline.createInterface({ input, output });
  let browser;

  try {
    browser = await launchBrowser();
    const { context, page } = await createPage(browser);
    await page.goto(selectors.startUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    logger.info("수집 전 브라우저에서 조회 기간을 확인하세요.");
    await rl.question(
      "브라우저에서 계좌번호, 계좌 비밀번호, 생년월일을 직접 입력하고 조회 버튼을 누르세요.\n거래내역 화면이 표시되면 터미널에서 Enter를 누르세요."
    );

    const activePage = await latestPage(context, page);

    if (inspectOnly) {
      const report = await inspectPage(activePage);
      logger.info("inspect 결과", report);
      await waitForExit(rl);
      return;
    }

    const rawRows = await collectAllPages(activePage);
    const normalizedRows = normalizeRows(rawRows);
    const totals = summarize(normalizedRows);

    logger.info("저장 전 요약", totals);
    const confirm = (await rl.question("위 거래내역을 CSV와 JSON으로 저장할까요? y 입력 시 저장합니다: ")).trim().toLowerCase();
    if (confirm !== "y") {
      logger.warn("사용자 취소로 파일을 저장하지 않았습니다.");
      await waitForExit(rl);
      return;
    }

    const timestamp = fileTimestamp();
    const csvPath = path.join(process.cwd(), "data", "normalized", "woori", `woori-transactions-${timestamp}.csv`);
    const jsonPath = path.join(process.cwd(), "data", "normalized", "woori", `woori-transactions-${timestamp}.json`);
    const rawPath = path.join(process.cwd(), "data", "raw", "woori", `woori-transactions-${timestamp}.json`);

    await exportJson(rawRows, rawPath);
    await exportCsv(normalizedRows, csvPath);
    await exportJson(normalizedRows, jsonPath);

    logger.info("저장 완료", { rawPath, csvPath, jsonPath });
    await waitForExit(rl);
  } catch (error) {
    logger.error(error.message);
    process.exitCode = 1;
    if (browser) await waitForExit(rl).catch(() => {});
  } finally {
    rl.close();
    if (browser) await browser.close().catch(() => {});
  }
}

function summarize(rows) {
  return {
    count: rows.length,
    withdrawalTotal: rows.reduce((sum, row) => sum + row.withdrawal, 0),
    depositTotal: rows.reduce((sum, row) => sum + row.deposit, 0),
    balanceLast: rows[rows.length - 1]?.balance || 0
  };
}

async function waitForExit(rl) {
  while (true) {
    const command = (await rl.question("브라우저를 닫고 종료하려면 exit를 입력하세요: ")).trim().toLowerCase();
    if (command === "exit" || command === "quit" || command === "q") return;
  }
}

if (require.main === module) {
  main();
}

module.exports = { summarize };
