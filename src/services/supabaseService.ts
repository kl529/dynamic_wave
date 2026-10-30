'use client'

import type { TradeRecord } from '@/lib/supabase';

type NewRecord = Pick<TradeRecord, 'trade_date' | 'division_number' | 'trade_type' | 'quantity' | 'price'> & { comment?: string | null };

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/**
 * 매매 기록 (수동 입력용). DB 접근은 서버 라우트(/api/db/trade-records)가 한다.
 */
export class TradeRecordService {
  static addRecord(record: NewRecord): Promise<TradeRecord> {
    return request('/api/db/trade-records', { method: 'POST', body: JSON.stringify(record) });
  }

  /** 최근순 */
  static getRecords(): Promise<TradeRecord[]> {
    return request('/api/db/trade-records');
  }

  static deleteRecord(recordId: number): Promise<void> {
    return request(`/api/db/trade-records?id=${recordId}`, { method: 'DELETE' });
  }

  /**
   * 로컬스토리지 데이터를 DB로 마이그레이션
   */
  static async migrateFromLocalStorage(): Promise<number> {
    if (typeof window === 'undefined') return 0;

    const localData = localStorage.getItem('tradeRecords');
    if (!localData) return 0;

    const records = JSON.parse(localData);
    if (!Array.isArray(records) || records.length === 0) return 0;

    for (const r of records) {
      await this.addRecord({
        trade_date: r.date,
        division_number: r.division,
        trade_type: r.action as 'BUY' | 'SELL',
        quantity: r.quantity,
        price: r.price,
        comment: r.comment || null,
      });
    }

    // 마이그레이션 성공 후 로컬스토리지 백업 키로 이동
    localStorage.setItem('tradeRecords_backup', localData);
    localStorage.removeItem('tradeRecords');

    return records.length;
  }
}
