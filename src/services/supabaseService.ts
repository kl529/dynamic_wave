'use client'

import { supabase, isSupabaseConfigured, type TradeRecord } from '@/lib/supabase';

const DEFAULT_USER_ID = 'default_user';

/**
 * 사용자 매매 기록 관리 (수동 입력용)
 */
export class TradeRecordService {
  /**
   * Supabase 연결 확인
   */
  static checkConnection(): void {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase가 설정되지 않았습니다. 환경변수를 확인하세요.');
    }
  }

  /**
   * 매매 기록 추가
   */
  static async addRecord(record: Omit<TradeRecord, 'id' | 'created_at'>): Promise<TradeRecord> {
    this.checkConnection();

    const { data, error } = await supabase
      .from('trade_records')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('Failed to add trade record:', error);
      throw error;
    }

    return data;
  }

  /**
   * 매매 기록 조회 (최근순)
   */
  static async getRecords(
    userId: string = DEFAULT_USER_ID,
    limit: number = 100
  ): Promise<TradeRecord[]> {
    this.checkConnection();

    const { data, error } = await supabase
      .from('trade_records')
      .select('*')
      .eq('user_id', userId)
      .order('trade_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch trade records:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * 매매 기록 삭제
   */
  static async deleteRecord(recordId: number): Promise<void> {
    this.checkConnection();

    const { error } = await supabase
      .from('trade_records')
      .delete()
      .eq('id', recordId);

    if (error) {
      console.error(`Failed to delete trade record ${recordId}:`, error);
      throw error;
    }
  }

  /**
   * 로컬스토리지 데이터를 Supabase로 마이그레이션
   */
  static async migrateFromLocalStorage(userId: string = DEFAULT_USER_ID): Promise<number> {
    this.checkConnection();

    if (typeof window === 'undefined') return 0;

    const localData = localStorage.getItem('tradeRecords');
    if (!localData) return 0;

    const records = JSON.parse(localData);
    if (!Array.isArray(records) || records.length === 0) return 0;

    const supabaseRecords = records.map((r: any) => ({
      user_id: userId,
      trade_date: r.date,
      division_number: r.division,
      trade_type: r.action as 'BUY' | 'SELL',
      quantity: r.quantity,
      price: r.price,
      amount: r.amount,
      comment: r.comment || null
    }));

    const { error } = await supabase
      .from('trade_records')
      .insert(supabaseRecords);

    if (error) {
      console.error('Failed to migrate trade records:', error);
      throw error;
    }

    // 마이그레이션 성공 후 로컬스토리지 백업 키로 이동
    localStorage.setItem('tradeRecords_backup', localData);
    localStorage.removeItem('tradeRecords');

    return records.length;
  }

  /**
   * Supabase 연결 상태 확인
   */
  static isConfigured(): boolean {
    return isSupabaseConfigured;
  }
}
