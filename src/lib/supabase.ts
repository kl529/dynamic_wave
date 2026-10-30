// 매매 기록 타입. DB는 로컬 PostgreSQL이고, 접근은 서버 라우트 /api/db/trade-records 에서만 한다.
// (파일명은 Supabase 시절 이름을 유지)
export interface TradeRecord {
  id?: number;
  user_id: string;
  trade_date: string;
  division_number: number;
  trade_type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  amount: number;
  comment?: string | null;
  created_at?: string;
}
