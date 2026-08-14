# 가족 공동 가계부 데이터 모델 설계

> 문서 상태: 설계안 1.0  
> 작성일: 2026-08-13  
> 기준 문서: `AGENTS.md`, `docs/PRD.md`, `docs/ACCOUNT_BOOK_DIAGNOSIS.md`  
> 확인 코드: `supabase/schema.sql`, `supabase/seed.sql`, `lib/dataStore.js`, `lib/calculations.js`, `app/page.js`  
> 주의: 이 문서는 설계와 migration 계획이다. migration 파일 생성, SQL 실행, seed 실행, 원격 Supabase 변경을 승인하지 않는다.

## 1. 설계 목표

`dad`와 `mom`이 같은 `household`의 거래 원장을 공유하면서 다음을 일관되게 표현하는 것이 목표다.

- 거래를 사용한 가족 구성원과 거래를 입력한 로그인 사용자를 분리한다.
- 수입, 지출, 이체를 하나의 거래 원장에서 관리한다.
- 현금, 신용카드, 은행 계좌, 지역화폐를 공통 자산 모델로 다룬다.
- 이체는 출발 자산과 도착 자산을 모두 기록하고 수입·지출 통계에서는 제외한다.
- 수입/지출 카테고리와 대분류/소분류를 표현한다.
- 수기, CSV, Excel, 향후 SMS 입력의 출처와 중복 여부를 추적한다.
- 월 합계, 전월 비교, 사용자·자산·카테고리 통계가 모두 같은 거래 원장을 사용한다.
- 기존 데이터를 삭제하거나 기존 열을 즉시 이름 변경하지 않고 단계적으로 전환한다.

## 2. 확인 범위와 전제

### 2.1 확인된 저장소 상태

- 저장소에는 `households`, `profiles`, `household_members`, `cards`, `accounts`, `categories`, `transactions`, `fixed_expenses`, `installments` 테이블 정의가 있다.
- 모든 주요 테이블에 RLS가 활성화되는 SQL과 household 구성원 여부를 확인하는 함수가 있다.
- 앱은 `transactions.owner_user_id`와 `transactions.created_by`에 `dad` 또는 `mom` 문자열을 저장한다.
- 앱은 카드 거래에 `card_id`, 나머지 결제수단에 `account_id`를 저장한다.
- 현재 이체도 하나의 `payment_method`, `account_id` 또는 `card_id`만 가질 수 있다.
- 카테고리에는 `parent_id`가 있지만 현재 seed와 화면은 사실상 한 단계 카테고리만 사용한다.
- Supabase 설정이 없거나 구성원 조회 결과가 없으면 샘플/localStorage 데이터로 동작하는 경로가 있다.

### 2.2 확인되지 않은 사항

- 저장소의 `supabase/schema.sql`이 원격 Supabase에 실제 적용되었는지 확인되지 않았다.
- 원격 DB의 실제 테이블, 열, 제약조건, RLS 정책, 데이터 건수는 확인되지 않았다.
- `dad`와 `mom` Auth 사용자의 실제 UUID와 seed 적용 여부는 확인되지 않았다.
- 카드 대금 납부, 계좌 잔액, 공동 거래(`family/common`)의 최종 업무 규칙은 확정되지 않았다.

따라서 실제 migration 전에 원격 schema와 데이터 현황을 읽기 전용으로 확인해야 한다.

## 3. 현재 데이터 모델 분석

### 3.1 현재 테이블

| 테이블 | 현재 역할 | 장점 | 한계 또는 위험 |
|---|---|---|---|
| `households` | 가족 단위 | 모든 업무 데이터의 소유 범위 제공 | `updated_at`과 명시적 상태값 없음 |
| `profiles` | Auth 사용자의 표시 정보 | Auth UUID와 login/display 정보를 분리 | household별 별칭·상태는 구성원 테이블과 중복 |
| `household_members` | 사용자와 가족 연결, owner/member 역할 | 동일 household 공유와 RLS 기준 제공 | 일반 member도 구성원 전체 관리가 가능한 현재 RLS는 권한이 넓음 |
| `cards` | 신용카드 목록 | 카드 고유 표시 정보 관리 | 계좌와 별도여서 공통 자산 조회 및 이체 연결이 복잡함 |
| `accounts` | 현금·은행·지역화폐 | 카드 외 결제수단 관리 | `cards`와 공통 필드가 중복되고 카드까지 포괄하지 못함 |
| `categories` | 수입·지출 카테고리 | `parent_id`로 계층 확장 가능 | 부모와 자식의 household/type 일치 제약이 없음 |
| `transactions` | 거래 원장 | 수입·지출·이체 유형, 월 집계 기본값 존재 | 사용자 문자열, 자산 열 분산, 이체 양쪽 자산 부재, 출처·중복키 부재 |
| `fixed_expenses` | 고정비 원본 | 반복 지출의 기본 정보 보존 | 생성된 실제 거래와 원본 규칙의 연결이 없음 |
| `installments` | 할부 원본 | 월 금액과 기간 보존 | 생성된 거래 연결, 사용자, 카테고리, 상태 변경 이력 부족 |

### 3.2 현재 `transactions` 구조 평가

| 필요한 개념 | 현재 열 | 평가 |
|---|---|---|
| id | `id uuid` | 충족 |
| household | `household_id` | 충족 |
| 거래 사용자 | `owner_user_id text` | 부분 충족. Auth/구성원 FK가 아닌 문자열 |
| 입력 사용자 | `created_by text` | 부분 충족. 로그인한 Auth UUID를 보장하지 않음 |
| 날짜 | `transaction_date date` | 충족. 시각은 표현하지 않음 |
| 유형 | `type` | `income`, `expense`, `transfer` 지원 |
| 금액 | `amount numeric(14,0)` | 원 단위 정수에는 적합하나 현재 0원을 허용 |
| 자산/결제수단 | `payment_method`, `account_id`, `card_id` | 부분 충족. 서로 다른 열에 분산 |
| 이체 출발·도착 자산 | 없음 | 미충족 |
| 대분류·소분류 | `category_id`, `categories.parent_id` | 구조상 가능하나 실제 사용·검증 미완성 |
| 내용/사용처 | `merchant` | 충족 |
| 메모 | `memo` | 충족 |
| 데이터 출처 | 없음 | 미충족 |
| 외부 중복 식별 | 없음 | 미충족 |
| 생성일 | `created_at` | 충족 |
| 수정일 | `updated_at` + trigger | 충족 |

### 3.3 현재 계산과 무결성 문제

1. 현재 계산 코드는 `income`과 `expense`만 각 합계에 넣으므로 이체가 월 수입·지출에 직접 더해지지는 않는다.
2. 그러나 이체에 출발·도착 자산이 없어 실제 자산 이동과 잔액 변화를 표현할 수 없다.
3. `payment_method`, `account_id`, `card_id` 조합을 검증하는 DB 제약이 없어 카드 거래에 계좌가 들어가는 등 서로 맞지 않는 값이 저장될 수 있다.
4. `owner_user_id`와 `created_by`가 문자열이어서 실제 household 구성원과 로그인 사용자를 DB가 검증하지 못한다.
5. `amount >= 0`이므로 의미 없는 0원 거래가 가능하다.
6. 거래의 `category_id`, `account_id`, `card_id`가 같은 household 소속인지 FK만으로는 보장되지 않는다.
7. 현재 앱은 구성원 목록에 `.limit(1)`을 사용하므로 한 사용자가 여러 household에 속할 경우 선택 기준이 없다.

## 4. 권장 데이터 모델 개요

권장안은 `profiles`를 유지하고, 가족 안에서의 사용자 단위는 `household_members`를 기준으로 삼는다. 카드와 계좌는 신규 `assets`로 통합한다.

```text
auth.users
   │ 1:1
profiles
   │
   └──< household_members >── households
                                │
                                ├──< assets
                                ├──< categories ──< categories (parent)
                                ├──< transactions
                                ├──< budgets
                                ├──< import_jobs ──< transaction_inbox
                                └──< parser_rules

transactions
  ├── owner_member_id ──> household_members
  ├── created_by ───────> auth.users
  ├── category_id ──────> categories (소분류 또는 단일 분류)
  ├── from_asset_id ────> assets
  ├── to_asset_id ──────> assets
  └── import_job_id ────> import_jobs
```

### 4.1 핵심 설계 결정

| 주제 | 권장 결정 | 이유 |
|---|---|---|
| 사용자 기본 정보 | `profiles` 유지 | Supabase Auth UUID와 표시 정보를 안전하게 분리 |
| 거래를 사용한 사람 | `owner_member_id` → `household_members.id` | 해당 가족 구성원임을 명확하게 검증 |
| 거래를 입력한 사람 | `created_by` → `auth.users.id` | 실제 로그인 사용자 추적 |
| 공동 사용 | `owner_member_id` nullable + `usage_scope` 또는 별도 common member 중 승인 후 선택 | 가짜 Auth 사용자 생성을 피하고 의미를 명확히 해야 함 |
| 자산/결제수단 | 신규 `assets`로 통합 | 현금·카드·계좌·지역화폐 공통 조회와 이체 표현 단순화 |
| 카테고리 계층 | 자기 참조 `parent_id` 유지 | 대분류/소분류 요구를 최소 구조로 충족 |
| 이체 | 거래 한 건 + `from_asset_id`, `to_asset_id` | 한 번의 이동을 수입·지출 두 건으로 중복 기록하지 않음 |
| 가져오기 | inbox 검토 후 원장 반영 | 원본 보존, 미리보기, 중복 차단, 오류 수정 가능 |
| 예산 | household·월·카테고리 기준 | 거래 원장과 카테고리 통계를 직접 비교 가능 |

## 5. 권장 핵심 테이블

### 5.1 `households`

| 열 | 권장 타입/규칙 | 설명 |
|---|---|---|
| `id` | uuid PK | 가족 식별자 |
| `name` | text not null | 가족 표시 이름 |
| `created_by` | uuid FK → `auth.users.id` | 생성자 |
| `created_at` | timestamptz not null | 생성일 |
| `updated_at` | timestamptz not null | 수정일, 신규 추가 권장 |

### 5.2 `profiles`

| 열 | 권장 타입/규칙 | 설명 |
|---|---|---|
| `id` | uuid PK | 기존 PK 유지 |
| `user_id` | uuid unique FK → `auth.users.id` | 인증 사용자 |
| `login_id` | text unique not null | `dad`, `mom` 등의 로그인 별칭 |
| `display_name` | text not null | 화면 표시 이름 |
| `internal_email` | text unique | 내부 로그인 이메일. 외부 노출 최소화 |
| `created_at` | timestamptz not null | 생성일 |
| `updated_at` | timestamptz | 수정일 추가 권장 |

### 5.3 `household_members`

| 열 | 권장 타입/규칙 | 설명 |
|---|---|---|
| `id` | uuid PK | 거래 사용자 FK의 대상 |
| `household_id` | uuid FK → `households.id` | 소속 가족 |
| `user_id` | uuid FK → `auth.users.id` | 실제 로그인 사용자 |
| `display_name` | text not null | 가족 안에서의 표시 이름 |
| `role` | owner/member | 구성원 관리 권한 구분 |
| `status` | active/inactive | 탈퇴·비활성화 시 과거 거래 보존 |
| `created_at` | timestamptz | 생성일 |
| `updated_at` | timestamptz | 수정일 |

`unique(household_id, user_id)`를 유지한다. 거래가 참조 중인 구성원은 물리 삭제보다 비활성화를 사용한다.

### 5.4 `assets`

현재 `cards`와 `accounts`의 공통 대체 모델이다. 기존 두 테이블은 전환 기간 동안 유지한다.

| 열 | 권장 타입/규칙 | 설명 |
|---|---|---|
| `id` | uuid PK | 자산/결제수단 식별자 |
| `household_id` | uuid FK | 가족 소유 범위 |
| `type` | cash/credit_card/bank_account/local_currency | 자산 종류 |
| `name` | text not null | 표시 이름 |
| `provider_name` | text | 은행·카드사·지역화폐 운영사 |
| `owner_member_id` | uuid nullable FK | 특정 구성원 소유인 경우 |
| `linked_asset_id` | uuid nullable FK → `assets.id` | 카드 결제 계좌 등 선택적 연결 |
| `payment_day` | smallint nullable | 신용카드 결제일, 1~31 |
| `color` | text nullable | 화면 표시색 |
| `is_active` | boolean default true | 신규 거래 선택 가능 여부 |
| `sort_order` | integer default 0 | 표시 순서 |
| `created_at` | timestamptz | 생성일 |
| `updated_at` | timestamptz | 수정일 |

전체 계좌번호나 민감한 인증정보는 저장하지 않는다. 표시가 필요하면 별도 마스킹된 별칭만 검토한다.

### 5.5 `categories`

| 열 | 권장 타입/규칙 | 설명 |
|---|---|---|
| `id` | uuid PK | 카테고리 식별자 |
| `household_id` | uuid FK | 가족 소유 범위 |
| `name` | text not null | 카테고리 이름 |
| `type` | income/expense | 거래 유형 |
| `parent_id` | uuid nullable FK → `categories.id` | null이면 대분류, 값이 있으면 소분류 |
| `color` | text | 표시색 |
| `is_active` | boolean default true | 기존 거래 보존을 위한 비활성화 |
| `sort_order` | integer default 0 | 표시 순서 |
| `created_at` | timestamptz | 생성일 |
| `updated_at` | timestamptz | 수정일 |

부모와 자식은 같은 `household_id` 및 같은 `type`이어야 한다. MVP에서는 최대 2단계까지만 허용하는 검증을 권장한다.

### 5.6 `transactions`

| 열 | 권장 타입/규칙 | 설명 |
|---|---|---|
| `id` | uuid PK | 거래 식별자 |
| `household_id` | uuid not null FK | 가족 |
| `owner_member_id` | uuid nullable FK | 거래를 사용한 구성원 |
| `usage_scope` | member/common | 공동 거래 도입 시 사용. 도입 여부 승인 필요 |
| `transaction_date` | date not null | 거래일 |
| `type` | income/expense/transfer | 거래 유형 |
| `amount` | numeric(14,0), `> 0` | 원 단위 양수 금액 |
| `from_asset_id` | uuid nullable FK → `assets.id` | 지출·이체 출발 자산 |
| `to_asset_id` | uuid nullable FK → `assets.id` | 수입·이체 도착 자산 |
| `category_id` | uuid nullable FK → `categories.id` | 수입/지출 카테고리. 이체는 보통 null |
| `merchant` | text nullable | 내용/사용처 |
| `memo` | text nullable | 메모 |
| `source` | manual/csv/excel/sms/other | 데이터 출처 |
| `source_record_id` | text nullable | 원본 파일/메시지 내부 식별값 |
| `import_job_id` | uuid nullable FK | 가져오기 작업 |
| `dedup_key` | text nullable | 정규화된 중복 판정 키 |
| `created_by` | uuid not null FK → `auth.users.id` | 실제 입력/승인 사용자 |
| `updated_by` | uuid nullable FK → `auth.users.id` | 마지막 수정 사용자 |
| `is_fixed` | boolean | 기존 요구 보존 |
| `is_installment` | boolean | 기존 요구 보존 |
| `fixed_expense_id` | uuid nullable FK | 실제 거래와 고정비 원본 연결 |
| `installment_id` | uuid nullable FK | 실제 거래와 할부 원본 연결 |
| `created_at` | timestamptz not null | 생성일 |
| `updated_at` | timestamptz not null | 수정일 |

대분류는 `category_id`가 가리키는 소분류의 `parent_id`로 계산하는 것을 기본으로 권장한다. 거래에 `major_category_id`와 `sub_category_id`를 모두 저장하면 두 값이 어긋날 수 있기 때문이다. 단, 과거 분류명을 그대로 보존해야 하는 감사 요구가 생기면 별도 snapshot 열을 검토한다.

## 6. 거래 유형별 필수 규칙

| 유형 | `from_asset_id` | `to_asset_id` | `category_id` | 통계 반영 |
|---|---|---|---|---|
| `income` | null | 필수 | 수입 카테고리 필수 | 수입 합계에 1회 포함 |
| `expense` | 필수 | null | 지출 카테고리 필수 | 지출 합계에 1회 포함 |
| `transfer` | 필수 | 필수 | 원칙적으로 null | 수입·지출 합계에서 제외 |

추가 제약:

- 이체의 `from_asset_id`와 `to_asset_id`는 서로 달라야 한다.
- 연결된 자산, 카테고리, 구성원은 거래와 같은 household 소속이어야 한다.
- `income`에는 수입 카테고리, `expense`에는 지출 카테고리만 연결한다.
- 금액은 0보다 커야 한다.
- `created_by`는 클라이언트가 임의 문자열로 정하지 않고 `auth.uid()`를 기준으로 기록한다.

### 6.1 이체 통계 원칙

```text
월 총수입 = type = 'income'인 거래 amount 합계
월 총지출 = type = 'expense'인 거래 amount 합계
월 수지   = 월 총수입 - 월 총지출
월 이체액 = type = 'transfer'인 거래 amount 합계(참고 지표)
```

이체 한 건을 출금 거래와 입금 거래 두 건으로 만들지 않는다. 하나의 `transfer` 행에 출발·도착 자산을 기록한다. 자산 흐름을 계산할 때만 출발 자산에는 `-amount`, 도착 자산에는 `+amount`를 적용한다.

신용카드 구매는 지출 발생 시점에 `expense`로 기록하고, 카드 대금 납부를 별도 `transfer`로 기록하는 방식을 권장한다. 다만 신용카드를 자산으로 볼지 부채성 결제수단으로 볼지와 카드 대금 규칙은 migration 전에 사용자 승인이 필요하다.

## 7. 가져오기와 예산 확장 테이블

### 7.1 `import_jobs`

CSV/Excel 파일 한 번의 가져오기 작업을 나타낸다.

| 주요 열 | 설명 |
|---|---|
| `id`, `household_id` | 작업과 가족 |
| `source_type` | csv/excel, 향후 sms |
| `source_name` | 은행·카드사 또는 사용자 지정 출처 |
| `original_filename` | 파일명만 저장. 실제 파일 보관 여부는 별도 승인 |
| `status` | uploaded/parsing/review/committed/failed/cancelled |
| `total_count`, `accepted_count`, `duplicate_count`, `error_count` | 처리 결과 |
| `created_by`, `created_at`, `committed_at` | 작업 사용자와 시각 |
| `error_summary` | 민감정보를 제외한 오류 요약 |

원본 금융 파일을 DB나 저장소에 영구 보관하는 것은 기본값으로 두지 않는다. 필요 시 보관 기간, 접근 권한, 삭제 정책을 먼저 정한다.

### 7.2 `transaction_inbox`

가져온 원본 행을 실제 원장에 반영하기 전에 검토하는 staging 테이블이다.

| 주요 열 | 설명 |
|---|---|
| `id`, `household_id`, `import_job_id` | 소속과 작업 |
| `raw_payload` | 필요한 최소 원본 값. 민감정보 최소화 |
| 정규화 후보 열 | 날짜, 금액, 유형, 사용처, 자산, 카테고리 후보 |
| `dedup_key` | 중복 후보 비교 키 |
| `status` | pending/ready/duplicate/error/accepted/rejected |
| `matched_transaction_id` | 중복 또는 반영된 실제 거래 |
| `error_code`, `error_message` | 사용자 수정이 필요한 이유 |

`transaction_inbox` 데이터는 통계에 포함하지 않는다. 사용자가 승인하여 `transactions`에 반영된 거래만 원장과 통계의 기준이 된다.

### 7.3 `parser_rules`

| 주요 열 | 설명 |
|---|---|
| `id`, `household_id` | 규칙 소유 범위 |
| `source_type`, `source_name` | 적용 출처 |
| `rule_name`, `version` | 규칙 식별과 변경 추적 |
| `mapping` jsonb | 열 이름 매핑과 정규화 규칙 |
| `is_active`, `created_by`, `created_at`, `updated_at` | 상태와 감사 정보 |

임의 코드 실행이나 SQL 조각은 저장하지 않는다. 허용된 필드 매핑과 제한된 변환 옵션만 JSON으로 저장한다.

### 7.4 `budgets`

| 열 | 권장 타입/규칙 | 설명 |
|---|---|---|
| `id` | uuid PK | 예산 식별자 |
| `household_id` | uuid FK | 가족 |
| `budget_month` | date, 해당 월 1일 | 예산 월 |
| `category_id` | uuid FK | 지출 대분류 또는 소분류 |
| `owner_member_id` | uuid nullable FK | 가족 전체 또는 사용자별 선택 확장 |
| `amount` | numeric(14,0), `>= 0` | 예산액 |
| `created_by`, `created_at`, `updated_at` | 감사 정보 |

기본 MVP3 범위에서는 가족 전체 + 카테고리별 월 예산을 우선한다. 동일 월·카테고리·사용자 범위의 중복 예산을 막는 unique 규칙이 필요하다.

## 8. 현재 구조와 권장 구조 비교

| 영역 | 현재 구조 | 권장 구조 | 전환 방식 |
|---|---|---|---|
| 사용자 프로필 | `profiles` + Auth UUID | 유지, 수정일 보강 | 기존 데이터 유지 |
| 가족 구성원 | `household_members` | 거래 사용자 FK의 기준으로 사용 | 신규 FK를 추가하고 문자열 매핑 |
| 거래 사용자 | `owner_user_id text` | `owner_member_id uuid` | 병행 저장 후 검증 |
| 입력자 | `created_by text` | `created_by_user_id uuid` 또는 최종 `created_by uuid` | 신규 UUID 열로 시작, 기존 열 유지 |
| 카드 | `cards` | `assets(type=credit_card)` | 신규 assets에 복사하고 매핑표 유지 |
| 계좌·현금·지역화폐 | `accounts` | `assets`의 해당 type | 신규 assets에 복사하고 매핑표 유지 |
| 거래 자산 | `payment_method` + `card_id/account_id` | `from_asset_id/to_asset_id` | 기존 거래를 유형별로 backfill |
| 이체 | 단일 결제수단만 표현 | 출발·도착 자산 필수 | 기존 이체는 자동 추정 금지, 검토 대상 표시 |
| 카테고리 | `category_id` + `parent_id` | 유지·활성 상태·무결성 보강 | 비파괴 열/제약 추가 |
| 데이터 출처 | 없음 | `source`, `source_record_id`, `dedup_key` | 기존 거래는 `manual`로 backfill |
| 가져오기 | 없음 | `import_jobs`, `transaction_inbox`, `parser_rules` | 신규 테이블 추가 |
| 예산 | 없음 | `budgets` | MVP3에서 신규 테이블 추가 |
| 고정비·할부 | 원본만 별도 존재 | 실제 거래와 FK 연결 | 신규 nullable FK 추가 |
| RLS | household 구성원이 전체 관리 | 거래와 일반 데이터는 구성원, 구성원 관리는 owner 중심 | 정책을 검증 후 단계 교체 |

## 9. RLS와 보안 권장안

| 대상 | 조회 | 생성·수정·삭제 |
|---|---|---|
| `profiles` | 본인 | 본인, 변경 가능 필드 제한 |
| `households` | 구성원 | 이름 등 일반 설정은 정책 결정, 삭제는 owner만 |
| `household_members` | 같은 가족 구성원 | owner만 관리 권장 |
| `assets`, `categories` | 같은 가족 구성원 | dad/mom 모두 또는 owner만인지 승인 필요 |
| `transactions` | 같은 가족 구성원 | active 구성원 모두 가능 |
| `budgets` | 같은 가족 구성원 | active 구성원 모두 가능 권장 |
| 가져오기 테이블 | 같은 가족 구성원 | 작업 생성자 및 같은 가족 구성원, commit 권한 명시 |

보안 원칙:

- 모든 업무 테이블에 RLS를 유지한다.
- `household_id`만 클라이언트에서 받았다는 이유로 신뢰하지 않고 membership을 검사한다.
- `created_by`는 가능한 한 DB에서 `auth.uid()`로 설정한다.
- service role key를 브라우저에서 사용하지 않는다.
- 구성원 관리 정책은 일반 member가 owner를 변경하거나 다른 구성원을 제거할 수 없도록 분리한다.
- 개인정보가 포함될 수 있는 원본 payload와 파일의 보존 범위를 최소화한다.

## 10. 무손실 migration 계획

이 계획은 실행 순서 제안이며 아직 SQL을 만들거나 실행하지 않는다.

### 10.1 변경 목적

- 실제 사용자와 거래 사용자/입력자를 FK로 연결한다.
- 카드·계좌·현금·지역화폐를 통합 자산으로 표현한다.
- 이체의 출발·도착 자산을 기록한다.
- 가져오기 출처와 중복 검출 기반을 만든다.
- 대분류/소분류, 예산, 고정비·할부 연결을 확장 가능하게 한다.

### 10.2 0단계 — 원격 현황 확인과 백업

1. 원격 Supabase에 현재 schema가 적용되어 있는지 읽기 전용으로 확인한다.
2. 테이블별 행 수, null/고아 FK, `owner_user_id`와 `created_by`의 실제 값 종류를 집계한다.
3. 기존 이체 행 수와 각 행의 자산 정보 완전성을 확인한다.
4. 현재 월별 수입·지출·이체 합계 기준값을 기록한다.
5. DB 백업 또는 복구 가능한 snapshot 방법을 확인한다.

### 10.3 1단계 — 신규 구조 병행 추가

- 신규 `assets` 테이블을 추가한다.
- `transactions`에 nullable `owner_member_id`, `created_by_user_id`, `updated_by_user_id`, `from_asset_id`, `to_asset_id`, `source`, `source_record_id`, `dedup_key`, `import_job_id`를 추가한다.
- `categories`에 `is_active`, `updated_at`을 추가한다.
- 필요 시 `household_members`, `profiles`, `households`에 상태·수정일 열을 추가한다.
- 신규 테이블과 열의 RLS, FK, 인덱스를 추가하되 기존 앱 경로는 유지한다.

영향 대상: `cards`, `accounts`, `categories`, `transactions`, `household_members` 및 신규 `assets`; 신규 RLS 정책과 trigger.

### 10.4 2단계 — 기존 데이터 복사와 매핑

1. `cards` 각 행을 동일 UUID 또는 명시적 매핑표를 통해 `assets(type=credit_card)`로 복사한다.
2. `accounts.type` 값을 `cash`, `bank_account`, `local_currency`로 변환해 `assets`에 복사한다.
3. `owner_user_id='dad'/'mom'`을 `profiles.login_id`와 `household_members`를 통해 `owner_member_id`로 매핑한다.
4. `created_by='dad'/'mom'`을 `profiles.login_id`를 통해 실제 Auth UUID로 매핑한다.
5. 기존 거래의 `source`를 `manual`로 설정한다.
6. `expense`는 기존 카드/계좌를 `from_asset_id`로, `income`은 `to_asset_id`로 옮긴다.
7. 기존 `transfer`는 출발·도착 중 하나가 없으므로 자동 추정하지 않고 별도 검토 목록으로 남긴다.

매핑할 수 없는 값은 삭제하거나 임의 사용자로 지정하지 않는다. 예외 목록과 원본 값을 보존한다.

### 10.5 3단계 — 앱의 이중 읽기/쓰기 전환

- 앱이 신규 자산 및 UUID 열을 우선 사용하되 전환 기간에는 기존 `card_id`, `account_id`, 문자열 사용자 열을 fallback으로 읽는다.
- 신규·수정 거래는 신규 열과 기존 열을 함께 기록해 롤백 가능성을 유지한다.
- 이체 입력 화면에서 출발·도착 자산을 모두 요구한다.
- 통계는 `type` 기준으로 수입/지출만 집계하며 이체는 별도 지표로 표시한다.

앱 변경 예상 범위: `app/page.js`, `lib/dataStore.js`, `lib/calculations.js`, `lib/excelExport.js`, `lib/defaultData.js` 및 가계부용 테스트.

### 10.6 4단계 — 데이터 및 RLS 검증

- 기존 월별 수입·지출 합계가 migration 전 기준값과 일치하는지 확인한다.
- 이체가 수입·지출에 포함되지 않고 자산 이동에는 양쪽으로 반영되는지 확인한다.
- 모든 거래의 자산, 카테고리, 사용자 FK가 같은 household인지 검사한다.
- dad와 mom은 같은 거래를 조회·관리할 수 있고 다른 household에는 접근할 수 없는지 테스트한다.
- member가 구성원 역할을 임의 변경하지 못하는지 확인한다.
- CSV/Excel 중복키가 같은 household 안에서만 충돌하도록 확인한다.

### 10.7 5단계 — 제약 강화

백필과 앱 전환이 완전히 검증된 뒤에만 다음을 수행한다.

- 신규 필수 열을 `not null`로 강화한다. 단, 공동 거래와 과거 예외 정책을 먼저 확정한다.
- 거래 유형별 자산·카테고리 check 또는 검증 trigger를 활성화한다.
- household 일치 무결성을 보장하는 복합 FK 또는 제한된 trigger를 적용한다.
- RLS 정책을 owner/member 권한에 맞게 좁힌다.
- 중복 방지용 partial unique index를 적용한다.

### 10.8 6단계 — 구 구조 사용 중단

- 앱과 모든 조회·내보내기가 신규 구조만 사용하는지 확인한다.
- 기존 `payment_method`, `card_id`, `account_id`, 문자열 `owner_user_id`, 문자열 `created_by`는 즉시 삭제하지 않고 deprecated 상태로 일정 기간 유지한다.
- `cards`, `accounts`도 읽기 전용 호환 구조 또는 view로 유지할지 결정한다.
- 구 열과 테이블의 실제 삭제는 별도 migration, 별도 사용자 승인, 백업 확인 후에만 검토한다.

## 11. 기존 데이터 보존과 변환 원칙

- 기존 거래의 `id`, `household_id`, 날짜, 유형, 금액, 사용처, 메모, 생성·수정 시각을 유지한다.
- 기존 카드/계좌 UUID를 assets UUID로 재사용할 수 있는지 충돌 여부를 먼저 확인한다.
- UUID 재사용이 불가능하면 영구 매핑표 또는 migration 감사표를 남긴다.
- 매핑 실패 행은 migration을 중단시키거나 검토 큐로 분리하며 임의 보정하지 않는다.
- 기존 이체는 출발·도착 자산을 사람이 확인하기 전까지 완료된 신규 이체로 간주하지 않는다.
- 카테고리는 삭제하지 않고 `is_active=false`로 비활성화한다.
- mock/localStorage 데이터는 원격 운영 데이터로 자동 이전하지 않는다.

## 12. 되돌리기 계획

1. 구 테이블과 구 열을 유지해 구 앱이 계속 읽을 수 있게 한다.
2. 신규 쓰기 전환 전 DB snapshot과 월별 합계 기준값을 확보한다.
3. 전환 중 문제 발생 시 앱 feature flag 또는 배포 버전을 구 읽기 경로로 되돌린다.
4. 신규 열과 테이블에 기록된 데이터는 즉시 삭제하지 않고 쓰기만 중단한다.
5. 신규 구조에서 생성된 거래가 구 구조에도 이중 기록되었는지 확인한 뒤에만 구 앱으로 복귀한다.
6. RLS rollback은 RLS를 끄는 방식이 아니라 직전 검증된 정책으로 복원한다.

## 13. 검증 계획

| 검증 영역 | 방법 | 통과 기준 |
|---|---|---|
| 행 보존 | migration 전후 테이블·거래 건수 비교 | 기존 거래 누락 0건 |
| 금액 보존 | 월별·유형별 합계 비교 | 수입·지출 합계 완전 일치 |
| 이체 | 대표 사례와 전체 이체 검사 | 양쪽 자산 존재, 수입·지출 합계 영향 0 |
| 사용자 | 문자열과 UUID 매핑 결과 비교 | 매핑 실패 0건 또는 승인된 예외 목록 |
| 자산 | 카드/계좌와 assets 매핑 비교 | 활성/비활성 포함 누락 0건 |
| 카테고리 | 부모·자식·유형·household 검사 | 잘못된 연결 0건 |
| RLS | dad/mom/타 household 시나리오 | 가족 내 허용, 가족 외 거부 |
| CRUD | 등록·조회·수정·삭제 | 신규·기존 경로 모두 기대값 |
| 가져오기 | 같은 파일 재처리 | 중복 거래가 원장에 추가되지 않음 |
| 롤백 | 구 읽기 경로 재활성화 | 기존 거래 조회와 합계 정상 |

## 14. 인덱스 권장안

- `transactions(household_id, transaction_date desc)`
- `transactions(household_id, type, transaction_date desc)`
- `transactions(household_id, owner_member_id, transaction_date desc)`
- `transactions(household_id, category_id, transaction_date desc)`
- `transactions(household_id, from_asset_id, transaction_date desc)`
- `transactions(household_id, to_asset_id, transaction_date desc)`
- `transactions(household_id, dedup_key)`의 null 제외 partial unique 여부 검토
- `assets(household_id, is_active, sort_order)`
- `categories(household_id, type, parent_id, is_active, sort_order)`
- `budgets(household_id, budget_month, category_id)`
- `transaction_inbox(import_job_id, status)`

인덱스는 실제 데이터 규모와 조회 계획을 확인한 뒤 확정한다.

## 15. 이번 문서에서 변경하지 않은 것

- migration SQL 및 migration 파일을 만들지 않았다.
- `supabase/schema.sql`과 `supabase/seed.sql`을 수정하지 않았다.
- 원격 Supabase schema, RLS, Auth 사용자, 운영 데이터를 변경하지 않았다.
- 앱 기능 코드와 UI를 수정하지 않았다.
- mock 데이터를 운영 DB로 이동하지 않았다.

## 16. 실제 migration 전에 사용자 승인이 필요한 변경사항

아래 항목은 하나라도 미확정이면 해당 부분의 migration을 실행하지 않는다.

1. **통합 자산 모델:** `cards`와 `accounts`를 신규 `assets`로 통합하고 기존 구조를 병행 유지할지 승인.
2. **신용카드 회계 규칙:** 카드 구매를 지출로 기록하고 카드 대금 납부를 이체로 기록할지 승인.
3. **이체 모델:** 이체 한 건에 `from_asset_id`와 `to_asset_id`를 저장하고 수입·지출 통계에서 제외할지 승인.
4. **거래 사용자:** `owner_user_id text` 대신 `household_members.id` FK를 사용할지 승인.
5. **입력자 추적:** `created_by`를 실제 `auth.uid()` UUID로 기록하고 수정자도 별도로 남길지 승인.
6. **공동 거래:** `family/common`을 nullable 사용자 + `usage_scope=common`으로 표현할지, 별도 공동 구성원으로 표현할지 결정.
7. **카테고리:** 대분류/소분류 2단계를 사용하고 거래에는 최하위 카테고리 하나만 저장할지 승인.
8. **금액 규칙:** 0원 거래를 금지하고 금액을 원 단위 양수로 유지할지 승인.
9. **가져오기 구조:** `import_jobs`와 `transaction_inbox`를 두어 검토 후 원장에 반영할지 승인.
10. **중복 판정:** household 범위의 `dedup_key` 생성 기준과 중복 시 처리 방식을 승인.
11. **원본 보관:** CSV/Excel 원본 파일과 raw payload를 저장할지, 저장한다면 위치와 보관 기간을 결정.
12. **예산 범위:** 첫 버전은 가족 전체의 카테고리별 월 예산만 지원할지 승인.
13. **구성원 권한:** owner만 구성원·역할을 관리하고 dad/mom 모두 거래를 관리하도록 할지 승인.
14. **기존 이체 보정:** 기존 이체 행의 출발·도착 자산을 누가 어떤 기준으로 확인할지 결정.
15. **기존 테이블 수명:** `cards`, `accounts`와 구 거래 열을 얼마 동안 호환용으로 유지할지 결정.
16. **원격 현황 점검:** 실제 migration 계획 확정 전에 원격 Supabase schema·RLS·데이터를 읽기 전용으로 점검할 권한과 방법을 승인.
17. **실행 단위:** schema 추가, 데이터 백필, 앱 전환, 제약 강화, 구 구조 정리를 각각 별도 migration과 별도 검증 단계로 수행할지 승인.

승인 후에도 먼저 원격 현황과 백업 가능 여부를 확인하고, 실제 SQL 초안을 별도 검토받은 다음 실행해야 한다.
