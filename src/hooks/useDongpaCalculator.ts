'use client'

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MarketDataAPI } from '@/services/api';
import { DongpaConfig, MarketData, RealtimeQuote, BacktestResult } from '@/types';

export const useDongpaCalculator = (initialConfig: DongpaConfig) => {
  const [config, setConfig] = useState<DongpaConfig>(initialConfig);
  const [realtimeData, setRealtimeData] = useState<RealtimeQuote | null>(null);
  const [historicalData, setHistoricalData] = useState<MarketData[]>([]);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tradingSignals, setTradingSignals] = useState<any>(null);

  // 실시간 데이터 업데이트
  const updateRealtimeData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await MarketDataAPI.getCurrentSOXLData();
      setRealtimeData(data);
      setLastUpdate(new Date());
      
      // 매매 신호도 함께 업데이트
      const signals = await MarketDataAPI.getTradingSignals(config);
      setTradingSignals(signals);
      
    } catch (err) {
      console.error('실시간 데이터 업데이트 실패:', err);
      setError(err instanceof Error ? err.message : '데이터 조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [config]);

  // 백테스팅 실행
  const runBacktest = useCallback(async (days: number = 90) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await MarketDataAPI.runBacktest(config, days);
      setBacktestResult(result);
      
    } catch (err) {
      console.error('백테스팅 실패:', err);
      setError(err instanceof Error ? err.message : '백테스팅 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [config]);

  // 과거 데이터 로드
  const loadHistoricalData = useCallback(async (days: number = 90) => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await MarketDataAPI.getHistoricalSOXLData(days);
      setHistoricalData(data);
      
    } catch (err) {
      console.error('과거 데이터 로드 실패:', err);
      setError(err instanceof Error ? err.message : '데이터 로드 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 설정 업데이트
  const updateConfig = useCallback((newConfig: Partial<DongpaConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  // 투자금액 설정
  const setInitialCapital = useCallback((capital: number) => {
    updateConfig({ initialCapital: capital });
  }, [updateConfig]);

  // 투자 모드 설정
  const setTradingMode = useCallback((mode: 'safe' | 'aggressive') => {
    updateConfig({ mode });
  }, [updateConfig]);

  // 분할 수 설정
  const setDivisions = useCallback((divisions: number) => {
    updateConfig({ divisions });
  }, [updateConfig]);

  // 분할 금액 계산
  const divisionAmount = useMemo(() => {
    return config.initialCapital / config.divisions;
  }, [config.initialCapital, config.divisions]);

  // 다음 매수가/매도가 계산
  const nextPrices = useMemo(() => {
    if (!realtimeData) return { buyPrice: null, sellPrice: null };

    const modeConfig = {
      safe: { buyTarget: 0.03, sellTarget: 0.002 },
      aggressive: { buyTarget: 0.05, sellTarget: 0.025 }
    };

    const { buyTarget, sellTarget } = modeConfig[config.mode];
    const buyPrice = realtimeData.price * (1 - buyTarget);
    
    // 매도가는 보유 중일 때만 의미가 있음 (실제 평단가 필요)
    const sellPrice = tradingSignals?.avgPrice ? 
      tradingSignals.avgPrice * (1 + sellTarget) : null;

    return {
      buyPrice: Number(buyPrice.toFixed(2)),
      sellPrice: sellPrice ? Number(sellPrice.toFixed(2)) : null
    };
  }, [realtimeData, config.mode, tradingSignals]);

  // 자동 업데이트 설정
  useEffect(() => {
    updateRealtimeData();
    loadHistoricalData();
    
    const interval = setInterval(updateRealtimeData, 30000); // 30초마다
    return () => clearInterval(interval);
  }, [updateRealtimeData, loadHistoricalData]);

  // 설정 변경 시 백테스팅 재실행
  useEffect(() => {
    if (historicalData.length > 0) {
      runBacktest();
    }
  }, [config, runBacktest, historicalData.length]);

  return {
    // 상태
    config,
    realtimeData,
    historicalData,
    backtestResult,
    loading,
    lastUpdate,
    error,
    tradingSignals,
    
    // 계산된 값
    divisionAmount,
    nextPrices,
    
    // 액션
    updateRealtimeData,
    runBacktest,
    loadHistoricalData,
    setInitialCapital,
    setTradingMode,
    setDivisions,
    updateConfig,
  };
};