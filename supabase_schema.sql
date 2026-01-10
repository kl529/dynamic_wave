-- 동파법 SOXL 매매 시스템 - Supabase 스키마

-- 사용자 매매 기록 테이블 (수동 입력용)
CREATE TABLE IF NOT EXISTS trade_records (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default_user',
  trade_date DATE NOT NULL,
  division_number INTEGER NOT NULL CHECK (division_number BETWEEN 1 AND 5),
  trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY', 'SELL')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price DECIMAL(10, 2) NOT NULL CHECK (price > 0),
  amount DECIMAL(12, 2) NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_trade_records_user_date ON trade_records(user_id, trade_date DESC);

-- Row Level Security (RLS) 활성화
ALTER TABLE trade_records ENABLE ROW LEVEL SECURITY;

-- 기본 정책: 모든 사용자 접근 허용 (개발용)
CREATE POLICY "Enable all access for all users" ON trade_records FOR ALL USING (true);

-- 테이블 설명
COMMENT ON TABLE trade_records IS '사용자가 수동으로 입력한 매매 기록';
