-- 동파법 SOXL 자동매매 시스템 데이터베이스 스키마

-- 1. 분할 포트폴리오 상태 테이블
CREATE TABLE IF NOT EXISTS division_states (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default_user', -- 추후 인증 추가 시 사용
  division_number INTEGER NOT NULL CHECK (division_number BETWEEN 1 AND 5),
  status TEXT NOT NULL CHECK (status IN ('EMPTY', 'HOLDING')),
  cash DECIMAL(12, 2) NOT NULL DEFAULT 0,
  holdings INTEGER NOT NULL DEFAULT 0,
  avg_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  buy_date DATE,
  buy_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, division_number)
);

-- 2. 거래 내역 테이블
CREATE TABLE IF NOT EXISTS trade_history (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default_user',
  trade_date DATE NOT NULL,
  division_number INTEGER NOT NULL CHECK (division_number BETWEEN 1 AND 5),
  trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY', 'SELL', 'STOP_LOSS')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price DECIMAL(10, 2) NOT NULL CHECK (price > 0),
  amount DECIMAL(12, 2) NOT NULL,
  commission DECIMAL(10, 2) NOT NULL DEFAULT 0,
  profit DECIMAL(12, 2),
  profit_rate DECIMAL(8, 4),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 포트폴리오 스냅샷 테이블 (일별 자산 기록)
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default_user',
  snapshot_date DATE NOT NULL,
  total_cash DECIMAL(12, 2) NOT NULL,
  total_holdings INTEGER NOT NULL,
  total_value DECIMAL(12, 2) NOT NULL,
  total_assets DECIMAL(12, 2) NOT NULL,
  return_rate DECIMAL(8, 4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, snapshot_date)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_division_states_user ON division_states(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_user_date ON trade_history(user_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date ON portfolio_snapshots(user_id, snapshot_date DESC);

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_division_states_updated_at
  BEFORE UPDATE ON division_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) 활성화 (추후 인증 추가 시)
ALTER TABLE division_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- 기본 정책: 모든 사용자 접근 허용 (개발용)
CREATE POLICY "Enable all access for all users" ON division_states FOR ALL USING (true);
CREATE POLICY "Enable all access for all users" ON trade_history FOR ALL USING (true);
CREATE POLICY "Enable all access for all users" ON portfolio_snapshots FOR ALL USING (true);

-- 초기 데이터: 5개 분할 생성 (default_user)
INSERT INTO division_states (user_id, division_number, status, cash, holdings, avg_price, buy_price, total_cost)
VALUES
  ('default_user', 1, 'EMPTY', 2000, 0, 0, 0, 0),
  ('default_user', 2, 'EMPTY', 2000, 0, 0, 0, 0),
  ('default_user', 3, 'EMPTY', 2000, 0, 0, 0, 0),
  ('default_user', 4, 'EMPTY', 2000, 0, 0, 0, 0),
  ('default_user', 5, 'EMPTY', 2000, 0, 0, 0, 0)
ON CONFLICT (user_id, division_number) DO NOTHING;

-- 완료 메시지
COMMENT ON TABLE division_states IS '각 분할의 현재 상태 (현금, 보유량, 평단가 등)';
COMMENT ON TABLE trade_history IS '모든 거래 내역 (매수/매도 기록)';
COMMENT ON TABLE portfolio_snapshots IS '일별 포트폴리오 스냅샷 (자산 추이 기록)';
