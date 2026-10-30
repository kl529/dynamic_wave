-- 동파 매매 기록 - PostgreSQL 스키마 (새로 만들 때)
-- 이미 테이블이 있으면 아래 '기존 DB 마이그레이션'만 실행한다.
-- 앱은 서버 라우트(/api/db/trade-records)에서만 접근한다. 브라우저는 DB에 직접 접근하지 않는다.

CREATE TABLE IF NOT EXISTS trade_records (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default_user',
  trade_date DATE NOT NULL,
  division_number INTEGER NOT NULL CHECK (division_number BETWEEN 1 AND 50),
  trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY', 'SELL')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price NUMERIC NOT NULL CHECK (price > 0),
  amount NUMERIC NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_records_user_date ON trade_records(user_id, trade_date DESC);

-- ── 기존 DB 마이그레이션 (2026-10-30) ─────────────────────────────
-- 예전 스키마는 분할 번호를 1~5로 제한했다. 기본 분할 수(10)로 기록하려면 실행한다.
--
-- ALTER TABLE trade_records DROP CONSTRAINT IF EXISTS trade_records_division_number_check;
-- ALTER TABLE trade_records ADD CONSTRAINT trade_records_division_number_check CHECK (division_number BETWEEN 1 AND 50);
