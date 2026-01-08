'use client'

import { useState, useEffect, useMemo, useCallback } from 'react';
import { DongpaConfig, MarketData, TodaySignal } from '@/types';
import { DongpaEngine } from '@/services/dongpaEngine';
import { MarketDataService } from '@/services/marketDataService';
import { TIMING, TRADING } from '@/constants';

interface UseDongpaEngineProps {
  config: DongpaConfig;
}

export const useDongpaEngine = ({ config }: UseDongpaEngineProps) => {
  const [historicalData, setHistoricalData] = useState<MarketData[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [changePercent, setChangePercent] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [lastDataRefreshDate, setLastDataRefreshDate] = useState<string>('');

  // 동파법 엔진 인스턴스
  const engine = useMemo(() => new DongpaEngine(config), [config]);

  // 일자별 거래 기록 계산
  const tradeHistory = useMemo(() => {
    if (!historicalData.length) return [];
    return engine.generateTradeHistory(historicalData);
  }, [engine, historicalData]);

  // 최근 거래 기록 (마지막 거래)
  const latestTrade = useMemo(() => {
    return tradeHistory.length > 0 ? tradeHistory[tradeHistory.length - 1] : null;
  }, [tradeHistory]);

  // 오늘 매매 신호 계산 (종가매매 LOC 방식)
  const todaySignal = useMemo((): TodaySignal => {
    if (historicalData.length === 0) {
      return {
        매수신호: {
          신호: 'HOLD' as const,
          매수량: 0,
          매수가: 0,
          매수금액: 0,
          수수료: 0,
          상승률: 0,
          목표상승률: Math.abs(TRADING.SAFE.BUY_TARGET * 100),
          메시지: '가격 정보 로딩 중...'
        },
        매도신호: {
          신호: 'NO_POSITION' as const,
          매도량: 0,
          매도가: 0,
          매도금액: 0,
          수수료: 0,
          실현수익: 0,
          수익률: 0,
          목표수익률: TRADING.SAFE.SELL_TARGET * 100,
          거래일보유기간: 0,
          메시지: '보유 종목 없음',
          손절여부: false
        }
      };
    }

    const todayClose = historicalData[historicalData.length - 1].price;
    const yesterdayClose = historicalData.length > 1
      ? historicalData[historicalData.length - 2].price
      : todayClose;

    return engine.getTodayTradingSignals(
      todayClose,
      yesterdayClose,
      new Date().toISOString().split('T')[0],
      latestTrade || undefined
    );
  }, [engine, historicalData, latestTrade]);

  // 실시간 데이터 업데이트
  const updateRealtimeData = useCallback(async () => {
    setLoading(true);
    
    try {
      const data = await MarketDataService.getCurrentSOXLData();
      setCurrentPrice(data.price);
      setChangePercent(data.changePercent);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('실시간 데이터 업데이트 실패:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 과거 데이터 로드
  const loadHistoricalData = useCallback(async (days: number = TIMING.DEFAULT_HISTORICAL_DAYS) => {
    setLoading(true);
    
    try {
      const data = await MarketDataService.getHistoricalSOXLData(days);
      setHistoricalData(data);
      
      if (data.length > 0) {
        const lastData = data[data.length - 1];
        setCurrentPrice(lastData.price);
        setChangePercent(lastData.changePercent);
      }
      
      const now = new Date();
      setLastUpdate(now);
      setLastDataRefreshDate(now.toISOString().split('T')[0]);
      
      console.log('📊 종가 데이터 갱신 완료 - 오늘 하루 신호 고정');
    } catch (error) {
      console.error('과거 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 실시간 현재가 업데이트 (참고용)
  const refreshCurrentPrice = useCallback(() => {
    updateRealtimeData();
  }, [updateRealtimeData]);

  // 미국 동부시간(ET) 기준으로 현재 시간 반환
  const getETDate = useCallback(() => {
    const now = new Date();
    const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    return new Date(etString);
  }, []);

  // 미국 장 마감 후인지 확인 (ET 기준 오후 4시 이후)
  const isAfterMarketClose = useCallback(() => {
    const etTime = getETDate();
    const hours = etTime.getHours();
    const day = etTime.getDay();
    
    if (day === 0 || day === 6) return false;
    
    return hours >= 16;
  }, [getETDate]);

  // 오늘 이미 데이터를 갱신했는지 확인 (ET 기준)
  const shouldRefreshData = useCallback(() => {
    const etTime = getETDate();
    const etToday = etTime.toISOString().split('T')[0];
    return lastDataRefreshDate !== etToday && isAfterMarketClose();
  }, [lastDataRefreshDate, isAfterMarketClose, getETDate]);

  // 초기 데이터 로드
  useEffect(() => {
    loadHistoricalData();
  }, [loadHistoricalData]);

  // 장 마감 후 자동 갱신 (1분마다 체크)
  useEffect(() => {
    const checkAndRefresh = () => {
      if (shouldRefreshData()) {
        console.log('🔔 미국 장 마감 확인 - 자동 데이터 갱신 시작');
        loadHistoricalData();
      }
    };

    checkAndRefresh();
    const interval = setInterval(checkAndRefresh, TIMING.MARKET_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [shouldRefreshData, loadHistoricalData]);

  // 전략 정보
  const strategyInfo = useMemo(() => {
    return engine.getStrategyInfo();
  }, [engine]);

  return {
    // 상태
    config,
    loading,
    lastUpdate,
    
    // 데이터
    historicalData,
    tradeHistory,
    latestTrade,
    currentPrice,
    changePercent,
    todaySignal,
    strategyInfo,
    
    // 액션
    loadHistoricalData,
    refreshCurrentPrice,
    updateRealtimeData
  };
};
