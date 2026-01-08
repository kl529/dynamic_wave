import { DongpaEngine } from '@/services/dongpaEngine';
import { DongpaConfig, MarketData } from '@/types';

// 테스트용 설정
const defaultConfig: DongpaConfig = {
  initialCapital: 10000,
  divisions: 5,
  mode: 'safe',
  rebalancePeriod: 10,
};

// 시장 데이터 생성 헬퍼
const createMarketData = (prices: number[], startDate: string = '2025-01-01'): MarketData[] => {
  return prices.map((price, index) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + index);
    // 주말 건너뛰기
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1);
    }
    return {
      date: date.toISOString().split('T')[0],
      price,
      change: index > 0 ? price - prices[index - 1] : 0,
      changePercent: index > 0 ? ((price - prices[index - 1]) / prices[index - 1]) * 100 : 0,
      volume: 1000000,
    };
  });
};

describe('DongpaEngine', () => {
  describe('constructor', () => {
    it('should initialize with config', () => {
      const engine = new DongpaEngine(defaultConfig);
      expect(engine).toBeInstanceOf(DongpaEngine);
    });

    it('should initialize with auto mode disabled', () => {
      const engine = new DongpaEngine(defaultConfig, false);
      expect(engine).toBeInstanceOf(DongpaEngine);
    });
  });

  describe('getTodayBuySignal', () => {
    let engine: DongpaEngine;

    beforeEach(() => {
      engine = new DongpaEngine(defaultConfig);
    });

    it('should return BUY signal when price drops more than buy target', () => {
      const result = engine.getTodayBuySignal({
        초기자금: 10000,
        분할횟수: 5,
        매매모드: 'safe',
        오늘종가: 97, // 3% 하락
        전일종가: 100,
        예수금: 2000,
      });

      expect(result.신호).toBe('BUY');
      expect(result.매수량).toBeGreaterThan(0);
      expect(result.매수가).toBe(97);
    });

    it('should return HOLD signal when price rises above buy target', () => {
      const result = engine.getTodayBuySignal({
        초기자금: 10000,
        분할횟수: 5,
        매매모드: 'safe',
        오늘종가: 104, // 4% 상승 (목표 3% 이상이면 매수 안 함)
        전일종가: 100,
        예수금: 2000,
      });

      expect(result.신호).toBe('HOLD');
      expect(result.매수량).toBe(0);
    });

    it('should return HOLD signal when insufficient cash', () => {
      const result = engine.getTodayBuySignal({
        초기자금: 10000,
        분할횟수: 5,
        매매모드: 'safe',
        오늘종가: 96, // 4% 하락
        전일종가: 100,
        예수금: 100, // 부족한 현금
      });

      expect(result.신호).toBe('HOLD');
      expect(result.메시지).toContain('부족');
    });

    it('should calculate correct buy quantity', () => {
      const result = engine.getTodayBuySignal({
        초기자금: 10000,
        분할횟수: 5,
        매매모드: 'safe',
        오늘종가: 90, // $90 가격
        전일종가: 100,
        예수금: 2000,
      });

      // 분할금액 2000 / 가격 90 = 22주
      expect(result.매수량).toBe(22);
      expect(result.매수가).toBe(90);
    });

    it('should use aggressive mode settings', () => {
      const result = engine.getTodayBuySignal({
        초기자금: 10000,
        분할횟수: 5,
        매매모드: 'aggressive',
        오늘종가: 106, // 6% 상승 (aggressive 목표 5% 이상이면 매수 안 함)
        전일종가: 100,
        예수금: 2000,
      });

      expect(result.신호).toBe('HOLD'); // 5% 이상 상승이므로 대기
    });
  });

  describe('getTodaySellSignal', () => {
    let engine: DongpaEngine;

    beforeEach(() => {
      engine = new DongpaEngine(defaultConfig);
    });

    it('should return NO_POSITION when no holdings', () => {
      const result = engine.getTodaySellSignal({
        매매모드: 'safe',
        오늘종가: 100,
        평단가: 0,
        보유량: 0,
        매수일자: '2025-01-01',
        오늘날짜: '2025-01-10',
      });

      expect(result.신호).toBe('NO_POSITION');
    });

    it('should return SELL signal when profit target reached', () => {
      const result = engine.getTodaySellSignal({
        매매모드: 'safe',
        오늘종가: 100.3, // 0.3% 상승 (safe 목표: 0.2%)
        평단가: 100,
        보유량: 10,
        매수일자: '2025-01-01',
        오늘날짜: '2025-01-05',
      });

      expect(result.신호).toBe('SELL');
      expect(result.매도량).toBe(10);
      expect(result.손절여부).toBe(false);
    });

    it('should return STOP_LOSS when holding period exceeded', () => {
      const result = engine.getTodaySellSignal({
        매매모드: 'safe',
        오늘종가: 99, // 손실 상태
        평단가: 100,
        보유량: 10,
        매수일자: '2025-01-01',
        오늘날짜: '2025-02-15', // 30일 이상
      });

      expect(result.신호).toBe('STOP_LOSS');
      expect(result.손절여부).toBe(true);
    });

    it('should return HOLD when neither profit nor time limit reached', () => {
      const result = engine.getTodaySellSignal({
        매매모드: 'safe',
        오늘종가: 100.1, // 0.1% 상승 (0.2% 미만)
        평단가: 100,
        보유량: 10,
        매수일자: '2025-01-01',
        오늘날짜: '2025-01-10', // 10일
      });

      expect(result.신호).toBe('HOLD');
    });

    it('should calculate correct profit rate', () => {
      const result = engine.getTodaySellSignal({
        매매모드: 'safe',
        오늘종가: 105, // 5% 상승
        평단가: 100,
        보유량: 10,
        매수일자: '2025-01-01',
        오늘날짜: '2025-01-05',
      });

      expect(result.수익률).toBeCloseTo(5, 1);
    });
  });

  describe('generateDailyTradeRecord', () => {
    let engine: DongpaEngine;

    beforeEach(() => {
      engine = new DongpaEngine(defaultConfig);
    });

    it('should generate a trade record for first day', () => {
      const record = engine.generateDailyTradeRecord({
        거래일자: '2025-01-02',
        종가: 97, // 3% 하락
        전일종가: 100,
        매매모드: 'safe',
        이전기록: null,
        초기자금: 10000,
        분할횟수: 5,
        갱신주기: 10,
      });

      expect(record.거래일자).toBe('2025-01-02');
      expect(record.종가).toBe(97);
      expect(record.매수량).toBeGreaterThan(0); // 3% 하락 시 매수
    });

    it('should track total assets correctly', () => {
      const record = engine.generateDailyTradeRecord({
        거래일자: '2025-01-02',
        종가: 105, // 5% 상승 (매수 조건 미충족)
        전일종가: 100,
        매매모드: 'safe',
        이전기록: null,
        초기자금: 10000,
        분할횟수: 5,
        갱신주기: 10,
      });

      // 매수하지 않았을 경우 총자산 = 초기자금
      expect(record.총자산).toBeCloseTo(10000, 0);
    });

    it('should handle auto mode by converting to safe', () => {
      const record = engine.generateDailyTradeRecord({
        거래일자: '2025-01-02',
        종가: 100,
        전일종가: 100,
        매매모드: 'auto',
        이전기록: null,
        초기자금: 10000,
        분할횟수: 5,
        갱신주기: 10,
      });

      expect(record.매매모드).toBe('safe');
    });
  });

  describe('generateTradeHistory', () => {
    let engine: DongpaEngine;

    beforeEach(() => {
      engine = new DongpaEngine(defaultConfig, false);
    });

    it('should return empty array for empty data', () => {
      const result = engine.generateTradeHistory([]);
      expect(result).toHaveLength(0);
    });

    it('should generate trade history for market data', () => {
      const prices = [100, 97, 95, 98, 100, 102];
      const marketData = createMarketData(prices);
      const result = engine.generateTradeHistory(marketData);

      expect(result).toHaveLength(6);
      result.forEach((trade, index) => {
        expect(trade.종가).toBe(prices[index]);
      });
    });

    it('should track cumulative profit/loss', () => {
      // 가격이 하락했다가 상승하는 시나리오
      const prices = [100, 96, 94, 96, 98, 100.5];
      const marketData = createMarketData(prices);
      const result = engine.generateTradeHistory(marketData);

      // 마지막 거래 기록 확인
      const lastTrade = result[result.length - 1];
      expect(lastTrade).toHaveProperty('누적손익');
      expect(lastTrade).toHaveProperty('총자산');
    });
  });

  describe('getTodayTradingSignals', () => {
    let engine: DongpaEngine;

    beforeEach(() => {
      engine = new DongpaEngine(defaultConfig);
    });

    it('should return both buy and sell signals', () => {
      const signals = engine.getTodayTradingSignals(
        97, // 오늘종가
        100, // 전일종가
        '2025-01-05',
        undefined
      );

      expect(signals).toHaveProperty('매수신호');
      expect(signals).toHaveProperty('매도신호');
    });

    it('should use previous trade record state', () => {
      const previousRecord = {
        거래일자: '2025-01-04',
        종가: 100,
        매매모드: 'safe' as const,
        변동률: 0,
        매수예정: 2000,
        매수지정가: 103,
        목표량: 19,
        매수가: 97,
        매수량: 20,
        매수금액: 1940,
        매수수수료: 0.91,
        매도지정가: 97.194,
        목표가: 97.194,
        매수일자: '2025-01-04',
        거래일보유기간: 1,
        MOC: 'HOLD' as const,
        매도일: '',
        매도가: 0,
        매도량: 0,
        매도금액: 0,
        매도수수료: 0,
        당일실현손익금액: 0,
        손익률: 0,
        손절여부: false,
        누적손익: 0,
        갱신복리금액: 0,
        자금갱신: false,
        시드: 10000,
        증액입출금: 0,
        예수금: 59.09,
        보유량: 20,
        평가금: 2000,
        총자산: 2059.09,
        수익률: -79.41,
        DD: 0,
        평단가: 97,
        최고자산: 10000
      };

      const signals = engine.getTodayTradingSignals(
        97.5, // 0.5% 상승 (safe 매도 목표 0.2% 달성)
        97,
        '2025-01-05',
        previousRecord
      );

      // 보유 중이고 수익률 0.2% 이상이면 매도 신호
      expect(signals.매도신호.신호).toBe('SELL');
    });
  });

  describe('getStrategyInfo', () => {
    it('should return safe mode info', () => {
      const engine = new DongpaEngine({ ...defaultConfig, mode: 'safe' });
      const info = engine.getStrategyInfo();

      expect(info.name).toBe('안전모드');
      expect(info.maxHoldingDays).toBe(30);
    });

    it('should return aggressive mode info', () => {
      const engine = new DongpaEngine({ ...defaultConfig, mode: 'aggressive' });
      const info = engine.getStrategyInfo();

      expect(info.name).toBe('공세모드');
      expect(info.maxHoldingDays).toBe(7);
    });

    it('should return auto mode info', () => {
      const engine = new DongpaEngine({ ...defaultConfig, mode: 'auto' });
      const info = engine.getStrategyInfo();

      expect(info.name).toBe('자동모드');
    });
  });

  describe('setAutoMode', () => {
    it('should toggle auto mode', () => {
      const engine = new DongpaEngine(defaultConfig, true);
      engine.setAutoMode(false);
      // Auto mode가 비활성화되면 수동 모드로 동작
      expect(engine).toBeInstanceOf(DongpaEngine);
    });
  });
});
