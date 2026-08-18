const selectors = require("../config/selectors");
const logger = require("./utils/logger");
const { collectTransactionRows } = require("./scraper");

async function collectAllPages(page) {
  const allRows = [];
  const visited = new Set();

  for (let pageNumber = 1; pageNumber <= selectors.maxPages; pageNumber += 1) {
    logger.info(`${pageNumber}페이지 거래내역 수집을 시작합니다.`);
    const rows = await collectTransactionRows(page);
    allRows.push(...rows);

    const signature = await pageSignature(page);
    if (visited.has(signature)) {
      logger.warn("같은 페이지 내용이 반복되어 페이지 이동을 중단합니다.");
      break;
    }
    visited.add(signature);

    const moved = await clickNextPage(page);
    if (!moved) break;
    await page.waitForTimeout(Math.max(selectors.waitAfterPageMs, 1000));
  }

  return allRows;
}

async function clickNextPage(page) {
  for (const frame of page.frames()) {
    for (const text of selectors.nextButtonTexts) {
      const locator = frame.getByRole("link", { name: text, exact: true }).or(frame.getByRole("button", { name: text, exact: true }));
      const count = await locator.count().catch(() => 0);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (!(await candidate.isVisible().catch(() => false))) continue;
        if (await candidate.isDisabled().catch(() => false)) continue;
        await candidate.click();
        logger.info(`다음 페이지 버튼을 클릭했습니다: ${text}`);
        return true;
      }
    }
  }
  logger.info("다음 페이지 버튼을 찾지 못해 수집을 종료합니다.");
  return false;
}

async function pageSignature(page) {
  const texts = [];
  for (const frame of page.frames()) {
    const text = await frame.locator("table").first().innerText({ timeout: 2000 }).catch(() => "");
    if (text) texts.push(text.slice(0, 2000));
  }
  return texts.join("\n---\n");
}

module.exports = { collectAllPages, clickNextPage };
