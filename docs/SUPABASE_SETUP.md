# Supabase 연결 설정

## 개요

매매 기록을 영구 저장하고 분할 현황을 계산하는 데 Supabase (PostgreSQL)를 사용합니다.
환경변수가 없으면 앱은 정상 동작하지만 매매 기록이 저장되지 않고 분할 현황이 초기 상태로 표시됩니다.

---

## 1. Supabase 프로젝트 생성

1. [https://supabase.com](https://supabase.com) 접속 → 새 프로젝트 생성
2. **Settings → API** 에서 다음 두 값 복사:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 2. 환경변수 설정

프로젝트 루트에 `.env.local` 파일 생성:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 3. 테이블 생성

Supabase 대시보드 → **SQL Editor** 에서 실행:

```sql
create table trade_records (
  id          bigserial primary key,
  user_id     text        not null default 'default_user',
  trade_date  date        not null,
  division_number integer not null check (division_number >= 1 and division_number <= 10),
  trade_type  text        not null check (trade_type in ('BUY', 'SELL')),
  quantity    integer     not null check (quantity > 0),
  price       numeric     not null check (price > 0),
  amount      numeric     not null,
  comment     text,
  created_at  timestamptz not null default now()
);

-- 조회 성능 인덱스
create index idx_trade_records_user_date
  on trade_records (user_id, trade_date desc);
```

---

## 4. 테이블 구조

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | bigserial | PK, 자동 증가 |
| `user_id` | text | 사용자 식별자 (기본값: `'default_user'`) |
| `trade_date` | date | 매매 날짜 (YYYY-MM-DD) |
| `division_number` | integer | 분할 번호 (1 ~ 10) |
| `trade_type` | text | `'BUY'` 또는 `'SELL'` |
| `quantity` | integer | 체결 수량 (주) |
| `price` | numeric | 체결 단가 ($) |
| `amount` | numeric | 총 체결 금액 (`quantity × price`) |
| `comment` | text | 메모 (선택) |
| `created_at` | timestamptz | 레코드 생성 시각 (자동) |

---

## 5. Row Level Security (선택)

기본적으로 anon key로 전체 접근이 가능합니다.
본인만 사용하는 경우 그대로 써도 무방하지만, 보안을 강화하려면:

```sql
-- RLS 활성화
alter table trade_records enable row level security;

-- anon 사용자에게 전체 CRUD 허용 (싱글 유저 용도)
create policy "allow_all_for_anon"
  on trade_records
  for all
  to anon
  using (true)
  with check (true);
```

---

## 6. 연결 확인

앱 실행 후 **매매 기록 탭**에서 기록을 추가했을 때 Supabase 대시보드 → **Table Editor → trade_records**에 데이터가 들어오면 연결 완료.

환경변수가 없을 때는 브라우저 콘솔에 다음 경고가 출력됩니다:
```
Supabase credentials not found. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
```

---

## 7. 로컬스토리지 데이터 마이그레이션

기존에 로컬스토리지에 저장된 매매 기록이 있다면, 앱 내 마이그레이션 기능을 통해 Supabase로 이전할 수 있습니다 (`TradeRecordService.migrateFromLocalStorage()`).
마이그레이션 후 원본은 `tradeRecords_backup` 키로 백업됩니다.
