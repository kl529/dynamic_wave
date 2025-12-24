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
  const [lastDataRefreshDate, setLastDataRefreshDate] = useState<string>(''); // 마지막 데이터 갱신 날짜

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
  // 종가 매수법: 전일 종가 기준으로 하루 종일 고정
  const todaySignal = useMemo((): TodaySignal => {
    if (historicalData.length === 0) {
      // 기본값 반환
      return {
        매수신호: {
          신호: 'HOLD' as const,
          매수량: 0,
          매수가: 0,
          매수금액: 0,
          수수료: 0,
          상승률: 0,
          목표상승률: 3,
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

    // 종가매매법: 오늘 종가 vs 어제 종가 비교 → 내일 신호 계산
    // historicalData의 마지막 = "오늘 종가" (장 마감 후 확정됨)
    const todayClose = historicalData[historicalData.length - 1].price;
    const yesterdayClose = historicalData.length > 1
      ? historicalData[historicalData.length - 2].price
      : todayClose;

    // 오늘 종가 기준으로 내일 매매 신호 계산 (내일 하루 종일 고정)
    return engine.getTodayTradingSignals(
      todayClose,
      yesterdayClose,
      new Date().toISOString().split('T')[0],
      latestTrade || undefined
    );
  }, [engine, historicalData, latestTrade]);

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

  // 실시간 데이터 업데이트 (참고용 - 신호 계산에는 사용 안됨)
  const updateRealtimeData = useCallback(() => {
    setLoading(true);
    
    // 모의 실시간 데이터 (종가매매법에서는 참고용으로만 사용)
    setTimeout(() => {
      const lastPrice = historicalData.length > 0 ? 
        historicalData[historicalData.length - 1].price : 25.0;
      
      const newChangePercent = (Math.random() - 0.5) * 20; // -10% ~ +10%
      const newPrice = lastPrice * (1 + newChangePercent / 100);
      
      // 실시간 가격만 업데이트 (historicalData는 변경하지 않음)
      setCurrentPrice(Number(newPrice.toFixed(2)));
      setChangePercent(Number(newChangePercent.toFixed(2)));
      setLastUpdate(new Date());
      setLoading(false);
    }, 1000);
  }, [historicalData]);

  // 과거 데이터 로드 (종가매매법: 장 마감 후 자동 갱신)
  const loadHistoricalData = useCallback((days: number = 90) => {
    setLoading(true);
    
    setTimeout(() => {
      const mockData = generateMockData(days);
      setHistoricalData(mockData);
      
      // 어제 종가를 현재가로 설정
      if (mockData.length > 0) {
        const lastData = mockData[mockData.length - 1];
        setCurrentPrice(lastData.price);
        setChangePercent(lastData.changePercent);
      }
      
      const now = new Date();
      setLastUpdate(now);
      setLastDataRefreshDate(now.toISOString().split('T')[0]); // YYYY-MM-DD
      setLoading(false);
      
      console.log('📊 종가 데이터 갱신 완료 - 오늘 하루 신호 고정');
    }, 1500);
  }, [generateMockData]);

  // 실시간 현재가 업데이트 (참고용)
  const refreshCurrentPrice = useCallback(() => {
    updateRealtimeData();
  }, [updateRealtimeData]);

  // 미국 동부시간(ET) 기준으로 현재 시간 반환
  const getETDate = useCallback(() => {
    // 'America/New_York' 타임존으로 변환 (EST/EDT 자동 처리)
    const now = new Date();
    const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    return new Date(etString);
  }, []);

  // 미국 장 마감 후인지 확인 (ET 기준 오후 4시 이후)
  const isAfterMarketClose = useCallback(() => {
    const etTime = getETDate();
    const hours = etTime.getHours();
    const day = etTime.getDay();
    
    // 주말 제외 (일요일=0, 토요일=6)
    if (day === 0 || day === 6) return false;
    
    // 오후 4시(16시) 이후
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

    // 즉시 체크
    checkAndRefresh();

    // 1분마다 체크
    const interval = setInterval(checkAndRefresh, 60000);

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