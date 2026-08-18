module.exports = {
  startUrl: process.env.WOORI_SPEED_URL || "https://nbi.wooribank.com/nbi/woori?withyou=BICOM0115",
  maxPages: Number(process.env.WOORI_MAX_PAGES || 50),
  waitAfterPageMs: Number(process.env.WOORI_PAGE_WAIT_MS || 1000),
  tableHeaderHints: [
    "거래일",
    "거래일시",
    "거래시간",
    "입금",
    "출금",
    "잔액",
    "거래내용",
    "내용",
    "취급점",
    "적요"
  ],
  nextButtonTexts: ["다음", "다음페이지", "Next", ">"],
  stopWarningTexts: [
    "자동화",
    "비정상",
    "차단",
    "보안상",
    "개발자도구",
    "캡차",
    "CAPTCHA",
    "인증"
  ]
};
