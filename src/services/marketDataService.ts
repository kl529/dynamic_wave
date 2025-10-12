'use client'

import { MarketData, RealtimeQuote } from '@/types';

export class MarketDataService {
  private static ALPHA_VANTAGE_KEY = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_KEY;
  private static CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';
  
  // Yahoo Finance를 기본으로 사용 (CORS 문제 해결)
  static async getCurrentSOXLData(): Promise<RealtimeQuote> {
    try {
      // Yahoo Finance API 시도
      const response = await fetch(`/api/yahoo-finance?symbol=SOXL`);
      
      if (response.ok) {
        const data = await response.json();
        return this.parseYahooData(data);
      }
    } catch (error) {
      console.warn('Yahoo Finance API 실패:', error);
    }

    // Alpha Vantage API 시도
    try {
      if (this.ALPHA_VANTAGE_KEY) {
        const data = await this.fetchAlphaVantageQuote('SOXL');
        return this.parseAlphaVantageData(data);
      }
    } catch (error) {
      console.warn('Alpha Vantage API 실패:', error);
    }

    // 목업 데이터 반환
    return this.getMockRealtimeData();
  }

  static async getHistoricalSOXLData(days: number = 90): Promise<MarketData[]> {
    try {
      // Yahoo Finance 과거 데이터 시도
      const response = await fetch(`/api/yahoo-finance?symbol=SOXL&period=${days}d`);
      
      if (response.ok) {
        const data = await response.json();
        return this.parseYahooHistorical(data);
      }
    } catch (error) {
      console.warn('과거 데이터 조회 실패:', error);
    }

    // Alpha Vantage 시도
    try {
      if (this.ALPHA_VANTAGE_KEY) {
        const data = await this.fetchAlphaVantageHistorical('SOXL');
        return this.parseAlphaVantageHistorical(data, days);
      }
    } catch (error) {
      console.warn('Alpha Vantage 과거 데이터 실패:', error);
    }

    // 목업 데이터 반환
    return this.getMockHistoricalData(days);
  }

  private static async fetchAlphaVantageQuote(symbol: string) {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.ALPHA_VANTAGE_KEY}`;
    const response = await fetch(url);
    return response.json();
  }

  private static async fetchAlphaVantageHistorical(symbol: string) {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${this.ALPHA_VANTAGE_KEY}`;
    const response = await fetch(url);
    return response.json();
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

  private static parseAlphaVantageData(data: any): RealtimeQuote {
    const quote = data['Global Quote'];
    
    if (!quote) {
      throw new Error('Invalid Alpha Vantage data');
    }

    return {
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
      volume: parseInt(quote['06. volume']),
      timestamp: new Date(quote['07. latest trading day']),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      open: parseFloat(quote['02. open']),
    };
  }

  private static parseAlphaVantageHistorical(data: any, days: number): MarketData[] {
    const timeSeries = data['Time Series (Daily)'];
    
    if (!timeSeries) {
      throw new Error('Invalid Alpha Vantage historical data');
    }

    const sortedDates = Object.keys(timeSeries).sort().slice(-days);
    
    return sortedDates.map((date, index) => {
      const dayData = timeSeries[date];
      const prevPrice = index > 0 ? parseFloat(timeSeries[sortedDates[index - 1]]['4. close']) : parseFloat(dayData['4. close']);
      const currentPrice = parseFloat(dayData['4. close']);
      const change = currentPrice - prevPrice;
      const changePercent = prevPrice > 0 ? (change / prevPrice) * 100 : 0;

      return {
        date,
        price: Number(currentPrice.toFixed(2)),
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        volume: parseInt(dayData['5. volume']),
        high: parseFloat(dayData['2. high']),
        low: parseFloat(dayData['3. low']),
        open: parseFloat(dayData['1. open']),
      };
    });
  }

  private static getMockRealtimeData(): RealtimeQuote {
    const basePrice = 28.45;
    const change = (Math.random() - 0.5) * 6; // -3% ~ +3%
    const price = Number((basePrice + change).toFixed(2));
    const changePercent = Number(((change / basePrice) * 100).toFixed(2));

    return {
      price,
      change: Number(change.toFixed(2)),
      changePercent,
      volume: Math.floor(Math.random() * 50000000) + 20000000,
      timestamp: new Date(),
      high: Number((price + Math.random() * 2).toFixed(2)),
      low: Number((price - Math.random() * 2).toFixed(2)),
      open: Number((price + (Math.random() - 0.5)).toFixed(2)),
    };
  }

  private static getMockHistoricalData(days: number): MarketData[] {
    const data: MarketData[] = [];
    let price = 25.0;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      // 주말 건너뛰기
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      
      // SOXL의 높은 변동성 반영 (-15% ~ +15%)
      const changePercent = (Math.random() - 0.5) * 30; // 높은 변동성
      const change = price * (changePercent / 100);
      price = Math.max(15.0, price + change); // 최소가 15달러
      
      data.push({
        date: date.toISOString().split('T')[0],
        price: Number(price.toFixed(2)),
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        volume: Math.floor(Math.random() * 50000000) + 20000000,
        high: Number((price * (1 + Math.random() * 0.05)).toFixed(2)),
        low: Number((price * (1 - Math.random() * 0.05)).toFixed(2)),
        open: Number((price * (1 + (Math.random() - 0.5) * 0.04)).toFixed(2)),
      });
    }
    
    return data;
  }
}