// Supabase → local PostgreSQL로 마이그레이션 완료
// DB 접근은 /api/db/trade-records 엔드포인트를 통해 이루어집니다

export const supabase = null as any;
export const isSupabaseConfigured = true;

export interface TradeRecord {
  id?: number;
  user_id: string;
  trade_date: string;
  division_number: number;
  trade_type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  amount: number;
  comment?: string;
  created_at?: string;
}
