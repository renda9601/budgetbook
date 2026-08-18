const { chromium } = require("playwright");
const logger = require("./utils/logger");

async function launchBrowser() {
  const channel = process.env.PLAYWRIGHT_CHANNEL || "msedge";
  logger.info(`브라우저를 headed 모드로 실행합니다. channel=${channel}`);
  return chromium.launch({
    channel,
    headless: false
  }).catch(async (error) => {
    if (channel !== "chrome") {
      logger.warn(`선택한 브라우저 채널 실행 실패: ${error.message}`);
      logger.info("Google Chrome 채널로 다시 시도합니다.");
      return chromium.launch({ channel: "chrome", headless: false });
    }
    throw error;
  });
}

async function createPage(browser) {
  const context = await browser.newContext({ viewport: null });
  context.on("page", (page) => {
    logger.info("새 팝업/창이 열렸습니다. 이후 현재 활성 페이지 후보에 포함합니다.");
    attachDialogLogger(page);
  });
  const page = await context.newPage();
  attachDialogLogger(page);
  return { context, page };
}

function attachDialogLogger(page) {
  page.on("dialog", async (dialog) => {
    logger.warn(`사이트 팝업 감지: ${dialog.type()} - ${dialog.message()}`);
    logger.warn("alert/confirm은 자동으로 닫지 않습니다. 사용자가 브라우저에서 직접 처리해야 합니다.");
  });
}

async function latestPage(context, fallbackPage) {
  const pages = context.pages();
  return pages[pages.length - 1] || fallbackPage;
}

module.exports = { launchBrowser, createPage, latestPage };
