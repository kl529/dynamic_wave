'use client'

import { supabase, type DivisionState, type TradeHistory, type PortfolioSnapshot } from '@/lib/supabase';

const DEFAULT_USER_ID = 'default_user';

/**
 * 분할 포트폴리오 상태 관리
 */
export class DivisionStateService {
  /**
   * 모든 분할 상태 조회
   */
  static async getAllDivisions(userId: string = DEFAULT_USER_ID): Promise<DivisionState[]> {
    const { data, error } = await supabase
      .from('division_states')
      .select('*')
      .eq('user_id', userId)
      .order('division_number', { ascending: true });

    if (error) {
      console.error('Failed to fetch divisions:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * 특정 분할 상태 조회
   */
  static async getDivision(divisionNumber: number, userId: string = DEFAULT_USER_ID): Promise<DivisionState | null> {
    const { data, error } = await supabase
      .from('division_states')
      .select('*')
      .eq('user_id', userId)
      .eq('division_number', divisionNumber)
      .single();

    if (error) {
      console.error(`Failed to fetch division ${divisionNumber}:`, error);
      return null;
    }

    return data;
  }

  /**
   * 분할 상태 업데이트
   */
  static async updateDivision(
    divisionNumber: number,
    updates: Partial<DivisionState>,
    userId: string = DEFAULT_USER_ID
  ): Promise<DivisionState | null> {
    const { data, error } = await supabase
      .from('division_states')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('division_number', divisionNumber)
      .select()
      .single();

    if (error) {
      console.error(`Failed to update division ${divisionNumber}:`, error);
      throw error;
    }

    return data;
  }

  /**
   * 모든 분할 초기화 (초기자금 재설정)
   */
  static async resetAllDivisions(
    initialCapital: number,
    divisions: number = 5,
    userId: string = DEFAULT_USER_ID
  ): Promise<void> {
    const cashPerDivision = initialCapital / divisions;

    const updates = Array.from({ length: divisions }, (_, i) => ({
      user_id: userId,
      division_number: i + 1,
      status: 'EMPTY' as const,
      cash: cashPerDivision,
      holdings: 0,
      avg_price: 0,
      buy_date: null,
      buy_price: 0,
      total_cost: 0
    }));

    const { error } = await supabase
      .from('division_states')
      .upsert(updates, { onConflict: 'user_id,division_number' });

    if (error) {
      console.error('Failed to reset divisions:', error);
      throw error;
    }
  }
}

/**
 * 거래 내역 관리
 */
export class TradeHistoryService {
  /**
   * 거래 내역 추가
   */
  static async addTrade(trade: Omit<TradeHistory, 'id' | 'created_at'>): Promise<TradeHistory> {
    const { data, error } = await supabase
      .from('trade_history')
      .insert(trade)
      .select()
      .single();

    if (error) {
      console.error('Failed to add trade:', error);
      throw error;
    }

    return data;
  }

  /**
   * 거래 내역 조회 (최근순)
   */
  static async getTrades(
    userId: string = DEFAULT_USER_ID,
    limit: number = 50
  ): Promise<TradeHistory[]> {
    const { data, error } = await supabase
      .from('trade_history')
      .select('*')
      .eq('user_id', userId)
      .order('trade_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch trades:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * 특정 날짜의 거래 내역 조회
   */
  static async getTradesByDate(
    date: string,
    userId: string = DEFAULT_USER_ID
  ): Promise<TradeHistory[]> {
    const { data, error } = await supabase
      .from('trade_history')
      .select('*')
      .eq('user_id', userId)
      .eq('trade_date', date)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`Failed to fetch trades for date ${date}:`, error);
      throw error;
    }

    return data || [];
  }

  /**
   * 거래 내역 삭제
   */
  static async deleteTrade(tradeId: number): Promise<void> {
    const { error } = await supabase
      .from('trade_history')
      .delete()
      .eq('id', tradeId);

    if (error) {
      console.error(`Failed to delete trade ${tradeId}:`, error);
      throw error;
    }
  }

  /**
   * 거래 통계 조회
   */
  static async getTradeStats(userId: string = DEFAULT_USER_ID): Promise<{
    totalTrades: number;
    totalBuyTrades: number;
    totalSellTrades: number;
    totalProfit: number;
    avgProfit: number;
  }> {
    const { data, error } = await supabase
      .from('trade_history')
      .select('trade_type, profit')
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to fetch trade stats:', error);
      throw error;
    }

    const totalTrades = data?.length || 0;
    const totalBuyTrades = data?.filter(t => t.trade_type === 'BUY').length || 0;
    const totalSellTrades = data?.filter(t => t.trade_type === 'SELL' || t.trade_type === 'STOP_LOSS').length || 0;
    const totalProfit = data?.reduce((sum, t) => sum + (t.profit || 0), 0) || 0;
    const avgProfit = totalSellTrades > 0 ? totalProfit / totalSellTrades : 0;

    return {
      totalTrades,
      totalBuyTrades,
      totalSellTrades,
      totalProfit,
      avgProfit
    };
  }
}

/**
 * 포트폴리오 스냅샷 관리
 */
export class PortfolioSnapshotService {
  /**
   * 스냅샷 저장
   */
  static async saveSnapshot(snapshot: Omit<PortfolioSnapshot, 'id' | 'created_at'>): Promise<PortfolioSnapshot> {
    const { data, error } = await supabase
      .from('portfolio_snapshots')
      .upsert(snapshot, { onConflict: 'user_id,snapshot_date' })
      .select()
      .single();

    if (error) {
      console.error('Failed to save snapshot:', error);
      throw error;
    }

    return data;
  }

  /**
   * 스냅샷 조회 (기간별)
   */
  static async getSnapshots(
    userId: string = DEFAULT_USER_ID,
    startDate?: string,
    endDate?: string
  ): Promise<PortfolioSnapshot[]> {
    let query = supabase
      .from('portfolio_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: true });

    if (startDate) {
      query = query.gte('snapshot_date', startDate);
    }
    if (endDate) {
      query = query.lte('snapshot_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch snapshots:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * 최근 스냅샷 조회
   */
  static async getLatestSnapshot(userId: string = DEFAULT_USER_ID): Promise<PortfolioSnapshot | null> {
    const { data, error } = await supabase
      .from('portfolio_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Failed to fetch latest snapshot:', error);
      return null;
    }

    return data;
  }
}
