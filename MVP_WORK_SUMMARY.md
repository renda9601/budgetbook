# 가족 공유 가계부 앱 MVP 작업 정리

## 개요

Next.js App Router 기반의 가족 공유 가계부 1차 MVP를 구현했다. 대상 사용자는 아빠와 엄마 2명이며, 수기 입력 기반으로 수입, 지출, 이체, 카드 지출, 은행/현금/지역화폐, 고정비, 할부, 월간 대시보드, 엑셀 저장을 관리한다.

## 기술 스택

- Next.js App Router
- React
- JavaScript
- Supabase Auth / Database / RLS 연동 구조
- Recharts
- ExcelJS
- lucide-react

## 구현 파일

- `app/page.js`: 로그인, 대시보드, 거래내역, 거래 등록/수정/삭제, 고정비/할부, 설정 화면
- `app/globals.css`: PC, 태블릿, 모바일 반응형 UI
- `lib/supabaseClient.js`: Supabase 클라이언트와 `dad`, `mom` 아이디 이메일 변환
- `lib/defaultData.js`: 기본 카드, 계좌, 카테고리, 5월/6월 샘플 데이터
- `lib/calculations.js`: 월간 집계, 전월 대비, 카드별/카테고리별/최근 3개월 계산
- `lib/dataStore.js`: Supabase 데이터 조회 및 데모 localStorage 저장소
- `lib/excelExport.js`: 선택 월 엑셀 파일 생성
- `lib/saveFile.js`: 브라우저 다운로드 유틸
- `supabase/schema.sql`: 테이블 생성, RLS 정책, 트리거
- `supabase/seed.sql`: dad/mom Auth 사용자 생성 후 실행하는 초기 데이터 seed

## 주요 기능

### 로그인

- 로그인 화면은 아이디/비밀번호 방식으로 구성
- `dad` 입력 시 내부적으로 `dad@family.local`로 변환
- `mom` 입력 시 내부적으로 `mom@family.local`로 변환
- Supabase 설정이 없으면 데모 모드로 실행
- `비밀번호 자동저장` 체크 기능 추가
  - 체크 후 로그인하면 브라우저 localStorage에 아이디/비밀번호 저장
  - 다음 접속 시 자동 입력
  - 체크 해제 상태로 로그인하면 저장값 삭제

### 가족 공유 구조

- household 기반 데이터 구조 설계
- `profiles`, `households`, `household_members` 테이블 포함
- dad는 `owner`, mom은 `member` 역할로 설계
- 현재 1차 MVP에서는 두 역할 모두 거래 등록/수정/삭제 가능

### 거래내역

- 수입, 지출, 이체 등록
- 거래일, 금액, 결제수단, 카드사, 계좌, 카테고리, 사용처, 메모, 입력자, 고정비 여부, 할부 여부 입력
- 월별 거래내역 조회
- 거래 수정 및 삭제
- 거래 유형, 결제수단, 카드사, 계좌, 카테고리, 입력자 필터
- 최신순/오래된순 정렬

### 대시보드

- 선택 월 기준 총수입
- 총지출
- 잔액/부족금
- 카드 지출
- 현금 지출
- 지역화폐 지출
- 은행 출금
- 고정비
- 변동비
- 전월 대비 지출 증감액
- 전월 대비 지출 증감률

### 차트

- 최근 3개월 수입/지출/잔액 흐름
- 카드사별 지출 막대그래프
- 카테고리별 지출 파이 차트
- 고정비/변동비 비교 차트

### 엑셀 저장

선택 월 기준으로 `가족가계부_YYYY-MM.xlsx` 파일을 생성한다.

포함 시트:

1. 월간 요약
2. 거래내역
3. 카드별 지출
4. 카테고리별 지출
5. 고정비/할부

금액은 숫자 타입으로 저장하고, 거래일은 날짜 타입으로 저장한다.

## 샘플 데이터 검증값

6월 샘플 데이터 기준:

- 총수입: 4,088,450원
- 신한카드: 2,353,330원
- 삼성카드: 47,220원
- 현대카드: 1,302,060원
- 카드 총합: 3,702,610원
- 고정비: 1,090,000원
- 총지출: 4,792,610원
- 부족금: -704,160원
- 5월 카드 총합: 3,351,208원
- 전월 대비 카드 증가액: +351,402원

기존 수기 기록의 `+51,402원`은 계산 오류이며, 앱 계산 기준은 `+351,402원`이다.

## Supabase 적용 순서

1. Supabase 프로젝트 생성
2. Auth에서 `dad@family.local`, `mom@family.local` 사용자 생성
3. `supabase/schema.sql` 실행
4. `supabase/seed.sql` 실행
5. `.env.local`에 아래 값 입력

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## 로컬 실행

```bash
npm install
npm run dev
```

현재 확인 URL:

```text
http://localhost:3000
```

## 검증 내역

- `npm install` 완료
- `npm run build` 성공
- `http://127.0.0.1:3000` HTTP 200 응답 확인

## 남은 후속 후보

- 카드/은행 CSV 또는 엑셀 가져오기
- 중복 거래 감지
- 카드사/은행별 가져오기 컬럼 매핑 저장
- 고정비 자동 반복 등록
- 할부 월별 자동 반영
- 실제 Supabase 데이터 기준 운영 검증
- Vercel 배포
