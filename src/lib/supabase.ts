import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 데이터베이스 타입 정의
export interface DivisionState {
  id?: number;
  user_id: string;
  division_number: number;
  status: 'EMPTY' | 'HOLDING';
  cash: number;
  holdings: number;
  avg_price: number;
  buy_date: string | null;
  buy_price: number;
  total_cost: number;
  created_at?: string;
  updated_at?: string;
}

export interface TradeHistory {
  id?: number;
  user_id: string;
  trade_date: string;
  division_number: number;
  trade_type: 'BUY' | 'SELL' | 'STOP_LOSS';
  quantity: number;
  price: number;
  amount: number;
  commission: number;
  profit?: number;
  profit_rate?: number;
  note?: string;
  created_at?: string;
}

export interface PortfolioSnapshot {
  id?: number;
  user_id: string;
  snapshot_date: string;
  total_cash: number;
  total_holdings: number;
  total_value: number;
  total_assets: number;
  return_rate: number;
  created_at?: string;
}
