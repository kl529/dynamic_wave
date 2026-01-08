import { renderHook } from '@testing-library/react';
import { useRSIMode, useRSIHistory } from '@/hooks/useRSIMode';
import { MarketData } from '@/types';

// 테스트용 시장 데이터 생성 헬퍼
const createMarketData = (prices: number[], startDate: string = '2025-01-01'): MarketData[] => {
  return prices.map((price, index) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + index);
    return {
      date: date.toISOString().split('T')[0],
      price,
      change: index > 0 ? price - prices[index - 1] : 0,
      changePercent: index > 0 ? ((price - prices[index - 1]) / prices[index - 1]) * 100 : 0,
      volume: 1000000,
    };
  });
};

describe('useRSIMode', () => {
  describe('with empty market data', () => {
    it('should return safe mode as default', () => {
      const { result } = renderHook(() =>
        useRSIMode({ marketData: [], enabled: true })
      );

      expect(result.current.mode).toBe('safe');
      expect(result.current.rsi).toBeNull();
      expect(result.current.loading).toBe(true);
    });

    it('should handle disabled state', () => {
      const { result } = renderHook(() =>
        useRSIMode({ marketData: [], enabled: false })
      );

      expect(result.current.mode).toBe('safe');
      expect(result.current.loading).toBe(false);
    });
  });

  describe('with valid market data', () => {
    it('should calculate RSI data', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const marketData = createMarketData(prices);

      const { result } = renderHook(() =>
        useRSIMode({ marketData, enabled: true })
      );

      expect(result.current.rsiData.length).toBeGreaterThan(0);
      expect(result.current.loading).toBe(false);
    });

    it('should return signal strength', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const marketData = createMarketData(prices);

      const { result } = renderHook(() =>
        useRSIMode({ marketData, enabled: true })
      );

      expect(result.current.signalStrength).toHaveProperty('strength');
      expect(result.current.signalStrength).toHaveProperty('label');
      expect(result.current.signalStrength).toHaveProperty('color');
    });

    it('should return last update date', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const marketData = createMarketData(prices);

      const { result } = renderHook(() =>
        useRSIMode({ marketData, enabled: true })
      );

      expect(result.current.lastUpdateDate).not.toBeNull();
    });

    it('should return mode reason', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const marketData = createMarketData(prices);

      const { result } = renderHook(() =>
        useRSIMode({ marketData, enabled: true })
      );

      expect(result.current.reason).toBeTruthy();
    });
  });

  describe('with insufficient data', () => {
    it('should handle short data gracefully', () => {
      const marketData = createMarketData([100, 101, 102]);

      const { result } = renderHook(() =>
        useRSIMode({ marketData, enabled: true })
      );

      expect(result.current.mode).toBe('safe');
      expect(result.current.error).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should not have error with valid data', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const marketData = createMarketData(prices);

      const { result } = renderHook(() =>
        useRSIMode({ marketData, enabled: true })
      );

      expect(result.current.error).toBeNull();
    });
  });
});

describe('useRSIHistory', () => {
  it('should return empty array for empty data', () => {
    const { result } = renderHook(() => useRSIHistory([]));

    expect(result.current.rsiHistory).toHaveLength(0);
  });

  it('should calculate RSI history for valid data', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const marketData = createMarketData(prices);

    const { result } = renderHook(() => useRSIHistory(marketData));

    expect(result.current.rsiHistory.length).toBe(30);
    expect(result.current.loading).toBe(false);
  });

  it('should include RSI values in history', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const marketData = createMarketData(prices);

    const { result } = renderHook(() => useRSIHistory(marketData));

    // After 14 days, RSI should be calculated
    const validRSIEntries = result.current.rsiHistory.filter(d => d.rsi !== null);
    expect(validRSIEntries.length).toBeGreaterThan(0);
  });
});
