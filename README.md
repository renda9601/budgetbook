# 우리은행 스피드 계좌조회 거래내역 저장 도구

Windows에서 Playwright로 실제 Edge 또는 Chrome을 열고, 사용자가 우리은행 스피드 계좌조회 화면에서 직접 조회한 거래내역을 CSV와 JSON으로 저장하는 로컬 자동화 프로그램입니다.

## 설치 방법

```bash
npm install
```

Playwright 브라우저가 필요하면 안내에 따라 설치합니다.

```bash
npx playwright install
```

## 실행 방법

```bash
npm run start
```

실행 후 브라우저가 열리면 사용자가 직접 입력합니다.

- 계좌번호
- 계좌 비밀번호
- 생년월일
- 필요한 인증서/보안 프로그램 절차
- 조회 기간
- 조회 버튼 클릭

거래내역 화면이 표시되면 터미널에서 Enter를 누릅니다. 프로그램은 현재 화면의 거래내역 표를 찾고, 저장 전 거래 건수와 입금/출금 합계를 보여줍니다. 사용자가 `y`를 입력해야 파일을 저장합니다.

## inspect

사이트 구조가 바뀌었거나 표를 찾지 못하면 아래 명령으로 화면 구조만 확인합니다.

```bash
npm run inspect
```

이 명령은 현재 페이지의 표 헤더, iframe 목록, 버튼 텍스트만 출력합니다. 입력 필드의 실제 값은 읽거나 출력하지 않습니다.

## 보안 주의사항

- 계좌번호, 계좌 비밀번호, 생년월일, 인증서 비밀번호를 소스코드에 저장하지 않습니다.
- `.env` 파일에도 계좌 비밀번호나 생년월일을 저장하지 않습니다.
- 사용자가 브라우저 화면에서 직접 개인정보를 입력합니다.
- 보안 키패드 입력은 자동화하지 않습니다.
- CAPTCHA, 인증서, 보안 프로그램, 자동화 탐지, 개발자도구 탐지 로직을 우회하지 않습니다.
- 사이트가 자동화를 차단하거나 경고 팝업을 표시하면 우회하지 말고 중단합니다.
- 네트워크 요청을 가로채거나 은행 내부 API를 역분석하지 않습니다.
- 송금, 이체, 계좌정보 변경 기능은 구현하지 않습니다.
- 조회와 거래내역 저장만 수행합니다.

## 결과 저장 위치

원본 표 데이터:

```text
data/raw/woori/
```

정규화 데이터:

```text
data/normalized/woori/
```

파일명 형식:

```text
woori-transactions-YYYYMMDD-HHmmss.csv
woori-transactions-YYYYMMDD-HHmmss.json
```

## 설정

초기 URL과 후보 선택자는 [config/selectors.js](./config/selectors.js)에서 관리합니다.

기본 URL:

```text
https://nbi.wooribank.com/nbi/woori?withyou=BICOM0115
```

환경변수로 URL을 바꿀 수도 있습니다.

```bash
set WOORI_SPEED_URL=https://example.com
npm run start
```

## 사이트 변경 시 대응

거래내역 표를 찾지 못하면 프로그램은 현재 페이지 제목, URL, 오류/경고 후보, 접근 가능한 표 헤더 목록, iframe 목록을 출력합니다. 출력된 헤더와 버튼 텍스트를 기준으로 `config/selectors.js`의 후보 헤더나 다음 페이지 버튼 텍스트를 보정하세요.

자동화 차단, 보안 경고, CAPTCHA, 인증서 문제는 우회하지 않습니다. 사용자가 브라우저에서 정상적인 절차로 조회 화면까지 이동한 뒤에만 거래내역 표를 수집합니다.
