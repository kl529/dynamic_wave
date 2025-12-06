'use client'

import { useState, useEffect, useMemo, useCallback } from 'react';
import { DongpaConfig, MarketData, DongpaTrade, TodaySignal } from '@/types';
import { DongpaEngine } from '@/services/dongpaEngine';

interface UseDongpaEngineProps {
  config: DongpaConfig;
}

export const useDongpaEngine = ({ config }: UseDongpaEngineProps) => {
  const [historicalData, setHistoricalData] = useState<MarketData[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [changePercent, setChangePercent] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

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
    if (currentPrice === 0) {
      // 기본값 반환
      return {
        매수신호: {
          신호: 'HOLD' as const,
          매수량: 0,
          매수가: 0,
          매수금액: 0,
          수수료: 0,
          하락률: 0,
          목표하락률: -3,
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
          목표수익률: 0.2,
          거래일보유기간: 0,
          메시지: '보유 종목 없음',
          손절여부: false
        }
      };
    }

    // 전일 종가 가져오기
    const prevClose = historicalData.length > 1
      ? historicalData[historicalData.length - 2].price
      : currentPrice;

    return engine.getTodayTradingSignals(
      currentPrice,
      prevClose,
      new Date().toISOString().split('T')[0],
      latestTrade || undefined
    );
  }, [engine, currentPrice, historicalData, latestTrade]);

  // 모의 데이터 생성 (테스트용)
  const generateMockData = useCallback((days: number = 90) => {
    const data: MarketData[] = [];
    let price = 25.0;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      // 주말 제외
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      
      // SOXL 특성상 높은 변동성 (일 -15% ~ +15%)
      const changePercent = (Math.random() - 0.5) * 30;
      price = Math.max(10, price * (1 + changePercent / 100));
      
      const change = price * (changePercent / 100);
      
      data.push({
        date: date.toISOString().split('T')[0],
        price: Number(price.toFixed(2)),
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        volume: Math.floor(Math.random() * 50000000) + 20000000,
        high: price * (1 + Math.random() * 0.05),
        low: price * (1 - Math.random() * 0.05),
        open: price * (1 + (Math.random() - 0.5) * 0.02)
      });
    }
    
    return data;
  }, []);

  // 실시간 데이터 업데이트 시뮬레이션
  const updateRealtimeData = useCallback(() => {
    setLoading(true);
    
    // 모의 실시간 데이터
    setTimeout(() => {
      const lastPrice = historicalData.length > 0 ? 
        historicalData[historicalData.length - 1].price : 25.0;
      
      const newChangePercent = (Math.random() - 0.5) * 20; // -10% ~ +10%
      const newPrice = lastPrice * (1 + newChangePercent / 100);
      
      setCurrentPrice(Number(newPrice.toFixed(2)));
      setChangePercent(Number(newChangePercent.toFixed(2)));
      setLastUpdate(new Date());
      setLoading(false);
    }, 1000);
  }, [historicalData]);

  // 과거 데이터 로드
  const loadHistoricalData = useCallback((days: number = 90) => {
    setLoading(true);
    
    setTimeout(() => {
      const mockData = generateMockData(days);
      setHistoricalData(mockData);
      
      // 마지막 가격을 현재가로 설정
      if (mockData.length > 0) {
        const lastData = mockData[mockData.length - 1];
        setCurrentPrice(lastData.price);
        setChangePercent(lastData.changePercent);
      }
      
      setLastUpdate(new Date());
      setLoading(false);
    }, 1500);
  }, [generateMockData]);

  // 실시간 현재가 업데이트
  const refreshCurrentPrice = useCallback(() => {
    updateRealtimeData();
  }, [updateRealtimeData]);

  // 초기 데이터 로드
  useEffect(() => {
    loadHistoricalData();
  }, [loadHistoricalData]);

  // 자동 새로고침 (30초마다)
  useEffect(() => {
    const interval = setInterval(() => {
      updateRealtimeData();
    }, 30000);

    return () => clearInterval(interval);
  }, [updateRealtimeData]);

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