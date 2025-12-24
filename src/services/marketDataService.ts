'use client'

import { MarketData, RealtimeQuote } from '@/types';

export class MarketDataService {
  // Yahoo Finance API를 통해 실시간 SOXL 데이터 가져오기
  static async getCurrentSOXLData(): Promise<RealtimeQuote> {
    try {
      const response = await fetch(`/api/yahoo-finance?symbol=SOXL`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return this.parseYahooData(data);
    } catch (error) {
      console.error('SOXL 실시간 데이터 조회 실패:', error);
      throw error;
    }
  }

  // Yahoo Finance API를 통해 과거 SOXL 데이터 가져오기
  static async getHistoricalSOXLData(days: number = 90): Promise<MarketData[]> {
    try {
      const response = await fetch(`/api/yahoo-finance?symbol=SOXL&period=${days}d`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return this.parseYahooHistorical(data);
    } catch (error) {
      console.error('과거 데이터 조회 실패:', error);
      throw error;
    }
  }

  private static parseYahooData(data: any): RealtimeQuote {
    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    const quote = result?.indicators?.quote?.[0];
    
    if (!meta || !quote) {
      throw new Error('Invalid Yahoo Finance data');
    }

    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      price: Number(currentPrice.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      volume: meta.regularMarketVolume || 0,
      timestamp: new Date(meta.regularMarketTime * 1000),
      high: Number((meta.regularMarketDayHigh || currentPrice).toFixed(2)),
      low: Number((meta.regularMarketDayLow || currentPrice).toFixed(2)),
      open: Number((meta.regularMarketPrice || currentPrice).toFixed(2)),
    };
  }

  private static parseYahooHistorical(data: any): MarketData[] {
    const result = data.chart?.result?.[0];
    
    if (!result) {
      throw new Error('Invalid Yahoo Finance historical data');
    }

    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const { open = [], high = [], low = [], close = [], volume = [] } = quotes;

    return timestamps.map((timestamp: number, index: number) => {
      const date = new Date(timestamp * 1000);
      const currentPrice = close[index] || 0;
      const prevPrice = index > 0 ? close[index - 1] : currentPrice;
      const change = currentPrice - prevPrice;
      const changePercent = prevPrice > 0 ? (change / prevPrice) * 100 : 0;

      return {
        date: date.toISOString().split('T')[0],
        price: Number(currentPrice.toFixed(2)),
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        volume: volume[index] || 0,
        high: Number((high[index] || currentPrice).toFixed(2)),
        low: Number((low[index] || currentPrice).toFixed(2)),
        open: Number((open[index] || currentPrice).toFixed(2)),
      };
    });
  }
}
