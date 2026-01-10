import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Supabase 클라이언트 생성 (환경변수 없으면 더미 클라이언트)
let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('Supabase credentials not found. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  // 빌드 시 에러 방지를 위한 더미 URL
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key');
}

export { supabase };
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// 사용자 매매 기록 (수동 입력용)
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
