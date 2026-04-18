'use client'

import type { TradeRecord } from '@/lib/supabase';

const DEFAULT_USER_ID = 'default_user';

export class TradeRecordService {
  static async addRecord(record: Omit<TradeRecord, 'id' | 'created_at'>): Promise<TradeRecord> {
    const res = await fetch('/api/db/trade-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error('매매 기록 추가 실패');
    return res.json();
  }

  static async getRecords(
    userId: string = DEFAULT_USER_ID,
    limit: number = 100
  ): Promise<TradeRecord[]> {
    const res = await fetch(
      `/api/db/trade-records?user_id=${encodeURIComponent(userId)}&limit=${limit}`
    );
    if (!res.ok) throw new Error('매매 기록 조회 실패');
    return res.json();
  }

  static async deleteRecord(recordId: number): Promise<void> {
    const res = await fetch(`/api/db/trade-records?id=${recordId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`매매 기록 삭제 실패 (id: ${recordId})`);
  }

  static async migrateFromLocalStorage(userId: string = DEFAULT_USER_ID): Promise<number> {
    if (typeof window === 'undefined') return 0;
    const localData = localStorage.getItem('tradeRecords');
    if (!localData) return 0;
    const records = JSON.parse(localData);
    if (!Array.isArray(records) || records.length === 0) return 0;

    const mapped = records.map((r: any) => ({
      user_id: userId,
      trade_date: r.date,
      division_number: r.division,
      trade_type: r.action as 'BUY' | 'SELL',
      quantity: r.quantity,
      price: r.price,
      amount: r.amount,
      comment: r.comment || null,
    }));

    await Promise.all(mapped.map((r) => TradeRecordService.addRecord(r)));

    localStorage.setItem('tradeRecords_backup', localData);
    localStorage.removeItem('tradeRecords');
    return records.length;
  }

  static isConfigured(): boolean {
    return true;
  }
}
