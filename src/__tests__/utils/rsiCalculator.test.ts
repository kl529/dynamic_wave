import {
  calculateRSI,
  determineTradingMode,
  getModeReason,
  getRSISignalStrength,
  enrichDataWithRSI,
  getLatestRSIMode,
  getWeeklyData,
  calculateWeeklyRSI,
  determineWeeklyMode,
  getWeeklyRSIModeInfo,
} from '@/utils/rsiCalculator';
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

describe('rsiCalculator', () => {
  describe('calculateRSI', () => {
    it('should return neutral RSI (50) when data is insufficient', () => {
      const data = createMarketData([100, 101, 102]);
      const result = calculateRSI(data);
      
      expect(result).toHaveLength(3);
      result.forEach(d => expect(d.rsi).toBe(50));
    });

    it('should return null RSI for first 14 days', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const data = createMarketData(prices);
      const result = calculateRSI(data);
      
      // First 14 days should have null RSI
      for (let i = 0; i < 14; i++) {
        expect(result[i].rsi).toBeNull();
      }
      // After that should have valid RSI
      for (let i = 14; i < result.length; i++) {
        expect(result[i].rsi).not.toBeNull();
      }
    });

    it('should return 100 when all prices are rising', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
      const data = createMarketData(prices);
      const result = calculateRSI(data);
      
      const lastRSI = result[result.length - 1].rsi;
      expect(lastRSI).toBe(100);
    });

    it('should return low RSI when all prices are falling', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 200 - i * 2);
      const data = createMarketData(prices);
      const result = calculateRSI(data);
      
      const lastRSI = result[result.length - 1].rsi;
      expect(lastRSI).toBeLessThan(10);
    });

    it('should return RSI around 50 for mixed price movements', () => {
      // Alternating up and down movements
      const prices = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
      const data = createMarketData(prices);
      const result = calculateRSI(data);
      
      const lastRSI = result[result.length - 1].rsi;
      expect(lastRSI).toBeGreaterThan(40);
      expect(lastRSI).toBeLessThan(60);
    });
  });

  describe('determineTradingMode', () => {
    it('should return safe mode when RSI data is null', () => {
      expect(determineTradingMode(null, null)).toBe('safe');
      expect(determineTradingMode(50, null)).toBe('safe');
      expect(determineTradingMode(null, 50)).toBe('safe');
    });

    it('should return safe mode when RSI > 65 and falling', () => {
      expect(determineTradingMode(68, 72)).toBe('safe');
    });

    it('should return safe mode when RSI between 40-50 and falling', () => {
      expect(determineTradingMode(45, 48)).toBe('safe');
    });

    it('should return safe mode when RSI crosses below 50', () => {
      expect(determineTradingMode(48, 52)).toBe('safe');
    });

    it('should return aggressive mode when RSI crosses above 50', () => {
      expect(determineTradingMode(52, 48)).toBe('aggressive');
    });

    it('should return aggressive mode when RSI < 35 and rising', () => {
      expect(determineTradingMode(32, 28)).toBe('aggressive');
    });

    it('should return aggressive mode when RSI between 30-60 and rising', () => {
      expect(determineTradingMode(45, 40)).toBe('aggressive');
    });
  });

  describe('getModeReason', () => {
    it('should return data insufficient message when RSI is null', () => {
      const reason = getModeReason('safe', null, null);
      expect(reason).toContain('데이터 부족');
    });

    it('should include RSI value in reason', () => {
      const reason = getModeReason('safe', 68, 72);
      expect(reason).toContain('68');
    });

    it('should mention overbought zone for high RSI', () => {
      const reason = getModeReason('safe', 68, 72);
      expect(reason).toContain('과매수');
    });

    it('should provide descriptive reason for mode', () => {
      const reason = getModeReason('safe', 48, 52);
      expect(reason).toContain('48'); // Should include current RSI value
    });
  });

  describe('getRSISignalStrength', () => {
    it('should return neutral for null RSI', () => {
      const result = getRSISignalStrength(null);
      expect(result.label).toBe('중립');
      expect(result.strength).toBe(50);
    });

    it('should return strong overbought for RSI >= 70', () => {
      const result = getRSISignalStrength(75);
      expect(result.label).toBe('강한 과매수');
      expect(result.strength).toBe(90);
    });

    it('should return overbought for RSI 65-70', () => {
      const result = getRSISignalStrength(67);
      expect(result.label).toBe('과매수');
    });

    it('should return neutral for RSI 45-55', () => {
      const result = getRSISignalStrength(50);
      expect(result.label).toBe('중립');
    });

    it('should return strong oversold for RSI < 30', () => {
      const result = getRSISignalStrength(25);
      expect(result.label).toBe('강한 과매도');
      expect(result.strength).toBe(10);
    });
  });

  describe('enrichDataWithRSI', () => {
    it('should enrich all data with RSI and mode', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const data = createMarketData(prices);
      const result = enrichDataWithRSI(data);
      
      expect(result).toHaveLength(30);
      result.forEach(d => {
        expect(d).toHaveProperty('rsi');
        expect(d).toHaveProperty('mode');
        expect(d).toHaveProperty('modeReason');
        expect(d).toHaveProperty('signalStrength');
      });
    });

    it('should set safe mode for first entry', () => {
      const data = createMarketData([100, 101, 102]);
      const result = enrichDataWithRSI(data);
      
      expect(result[0].mode).toBe('safe');
      expect(result[0].modeReason).toContain('초기');
    });
  });

  describe('getLatestRSIMode', () => {
    it('should return safe mode with no data message for empty array', () => {
      const result = getLatestRSIMode([]);
      expect(result.mode).toBe('safe');
      expect(result.reason).toContain('없음');
    });

    it('should return mode based on latest RSI', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const data = createMarketData(prices);
      const result = getLatestRSIMode(data);
      
      expect(['safe', 'aggressive']).toContain(result.mode);
      expect(result.rsi).not.toBeNull();
    });
  });

  describe('getWeeklyData', () => {
    it('should return empty array for empty input', () => {
      expect(getWeeklyData([])).toHaveLength(0);
    });

    it('should extract one entry per week', () => {
      // Create 3 weeks of data (21 days)
      const prices = Array.from({ length: 21 }, (_, i) => 100 + i);
      const data = createMarketData(prices, '2025-01-06'); // Start on Monday
      const result = getWeeklyData(data);
      
      // Should have approximately 3 weekly entries
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.length).toBeLessThanOrEqual(4);
    });
  });

  describe('calculateWeeklyRSI', () => {
    it('should return default RSI 50 when data is insufficient', () => {
      const data = createMarketData([100, 101, 102]);
      const result = calculateWeeklyRSI(data);
      
      result.forEach(d => {
        expect(d.rsi).toBe(50);
      });
    });
  });

  describe('determineWeeklyMode', () => {
    it('should return safe mode when RSI data is null', () => {
      const result = determineWeeklyMode(null, null);
      expect(result.mode).toBe('safe');
      expect(result.reason).toContain('부족');
    });

    it('should return safe mode when RSI is falling', () => {
      const result = determineWeeklyMode(55, 60);
      expect(result.mode).toBe('safe');
      expect(result.reason).toContain('하락');
    });

    it('should return aggressive mode when RSI is rising', () => {
      const result = determineWeeklyMode(55, 50);
      expect(result.mode).toBe('aggressive');
      expect(result.reason).toContain('상승');
    });

    it('should return safe mode for overbought zone (RSI > 65)', () => {
      const result = determineWeeklyMode(70, 65);
      expect(result.mode).toBe('safe');
      expect(result.reason).toContain('과매수');
    });
  });

  describe('getWeeklyRSIModeInfo', () => {
    it('should return safe mode with insufficient data message for short data', () => {
      const data = createMarketData([100, 101]);
      const result = getWeeklyRSIModeInfo(data);
      
      expect(result.mode).toBe('safe');
      expect(result.reason).toContain('부족');
      expect(result.lastWeekRSI).toBeNull();
    });
  });
});
