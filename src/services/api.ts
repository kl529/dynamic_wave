import { DongpaConfig, MarketData, BacktestResult, RealtimeQuote } from '@/types';
import { MarketDataService } from './marketDataService';
import { DongpaCalculator } from './dongpaCalculator';

export class MarketDataAPI {
  static async getCurrentSOXLData(): Promise<RealtimeQuote> {
    return MarketDataService.getCurrentSOXLData();
  }

  static async getHistoricalSOXLData(days: number = 90): Promise<MarketData[]> {
    return MarketDataService.getHistoricalSOXLData(days);
  }

  static async getTradingSignals(config: DongpaConfig) {
    try {
      // 최근 데이터로 신호 계산
      const recentData = await MarketDataService.getHistoricalSOXLData(10);
      const calculator = new DongpaCalculator(config);
      return calculator.calculateCurrentSignals(recentData);
    } catch (error) {
      console.error('매매 신호 조회 실패:', error);
      throw error;
    }
  }

  static async runBacktest(config: DongpaConfig, days: number = 90): Promise<BacktestResult> {
    try {
      const historicalData = await MarketDataService.getHistoricalSOXLData(days);
      const calculator = new DongpaCalculator(config);
      return calculator.runBacktest(historicalData);
    } catch (error) {
      console.error('백테스팅 실패:', error);
      throw error;
    }
  }

  static async getStrategyInfo(mode: 'safe' | 'aggressive') {
    const config: DongpaConfig = { initialCapital: 10000, divisions: 7, mode };
    const calculator = new DongpaCalculator(config);
    return calculator.getStrategyInfo();
  }

}