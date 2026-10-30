'use client'

import { MarketData } from '@/types';

// Yahoo Finance chart API 응답 중 사용하는 부분
interface YahooFinanceResponse {
  chart: {
    result: Array<{
      meta: {
        currentTradingPeriod?: { regular?: { start: number; end: number } };
      };
      timestamp?: number[];
      indicators?: {
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
  };
}

export type MarketSymbol = 'SOXL' | '^NDX' | 'QLD' | 'QQQ' | 'TQQQ' | 'SPY';

export class MarketDataService {
  /**
   * 최근 days 거래일의 확정된 일봉 (장중 미완성 봉 제외).
   * adjusted=true 면 배당까지 반영한 수정주가 (백테스트 수익률용). 신호·주문 가격은 실제 종가를 쓴다.
   */
  static async getHistory(symbol: MarketSymbol, days: number, adjusted = false): Promise<MarketData[]> {
    const response = await fetch(`/api/yahoo-finance?symbol=${encodeURIComponent(symbol)}&period=${days}d`);
    if (!response.ok) {
      throw new Error(`${symbol} 시세 조회 실패: HTTP ${response.status}`);
    }
    return this.parseYahooHistorical(await response.json(), Date.now() / 1000, adjusted);
  }

  static async getHistoricalSOXLData(days: number = 90): Promise<MarketData[]> {
    return this.getHistory('SOXL', days);
  }

  /**
   * 가격은 반올림하지 않는다 (과거 SOXL은 $1 미만이라 반올림이 수익률을 왜곡한다).
   * 정규장이 아직 끝나지 않은 오늘 봉은 종가가 아니므로 버린다.
   */
  static parseYahooHistorical(data: YahooFinanceResponse, nowSec: number, adjusted = false): MarketData[] {
    const result = data.chart?.result?.[0];
    if (!result) {
      throw new Error('Invalid Yahoo Finance historical data');
    }

    const timestamps = result.timestamp || [];
    const { open = [], high = [], low = [], close: rawClose = [], volume = [] } = result.indicators?.quote?.[0] || {};
    const close = (adjusted && result.indicators?.adjclose?.[0]?.adjclose) || rawClose;
    const session = result.meta?.currentTradingPeriod?.regular;

    const out: MarketData[] = [];
    timestamps.forEach((timestamp, index) => {
      const price = close[index];
      if (price == null) return;
      const inProgress = session && timestamp >= session.start && nowSec < session.end;
      if (inProgress) return;
      const prevPrice = out.length > 0 ? out[out.length - 1].price : price;
      out.push({
        date: new Date(timestamp * 1000).toISOString().split('T')[0],
        price,
        change: price - prevPrice,
        changePercent: prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0,
        volume: volume[index] || 0,
        high: high[index] ?? price,
        low: low[index] ?? price,
        open: open[index] ?? price,
      });
    });
    return out;
  }
}
