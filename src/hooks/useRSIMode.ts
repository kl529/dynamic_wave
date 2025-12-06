'use client'

import { useState, useEffect, useMemo } from 'react';
import { MarketData } from '@/types';
import {
  enrichDataWithRSI,
  getLatestRSIMode,
  RSIData
} from '@/utils/rsiCalculator';

interface UseRSIModeProps {
  marketData: MarketData[];
  enabled?: boolean; // RSI 모드 자동 결정 활성화 여부
}

interface RSIModeResult {
  mode: 'safe' | 'aggressive';
  rsi: number | null;
  prevRSI: number | null;
  reason: string;
  signalStrength: {
    strength: number;
    label: string;
    color: string;
  };
  rsiData: RSIData[];
  loading: boolean;
  error: string | null;
  lastUpdateDate: string | null; // 마지막 데이터 날짜 (YYYY-MM-DD)
}

/**
 * RSI 기반 자동 모드 결정 훅
 *
 * @param marketData - 시장 데이터 배열
 * @param enabled - RSI 모드 활성화 여부 (기본: true)
 * @returns RSI 모드 정보
 *
 * @example
 * ```tsx
 * const { mode, rsi, reason } = useRSIMode({
 *   marketData: historicalData,
 *   enabled: true
 * });
 * ```
 */
export function useRSIMode({
  marketData,
  enabled = true
}: UseRSIModeProps): RSIModeResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // RSI 데이터 계산 (메모이제이션)
  const rsiData = useMemo(() => {
    if (!enabled || !marketData || marketData.length === 0) {
      return [];
    }

    try {
      return enrichDataWithRSI(marketData);
    } catch (err) {
      console.error('RSI 계산 오류:', err);
      setError('RSI 계산 중 오류가 발생했습니다');
      return [];
    }
  }, [marketData, enabled]);

  // 최신 RSI 모드 가져오기
  const latestMode = useMemo(() => {
    if (!enabled || rsiData.length === 0) {
      return {
        mode: 'safe' as const,
        reason: 'RSI 데이터 없음 - 기본 안전모드',
        rsi: null,
        prevRSI: null
      };
    }

    try {
      return getLatestRSIMode(marketData);
    } catch (err) {
      console.error('RSI 모드 결정 오류:', err);
      setError('RSI 모드 결정 중 오류가 발생했습니다');
      return {
        mode: 'safe' as const,
        reason: '오류 발생 - 기본 안전모드',
        rsi: null,
        prevRSI: null
      };
    }
  }, [marketData, rsiData, enabled]);

  // 시그널 강도 계산
  const signalStrength = useMemo(() => {
    if (rsiData.length === 0) {
      return {
        strength: 50,
        label: '데이터 없음',
        color: '#888'
      };
    }

    const latest = rsiData[rsiData.length - 1];
    return latest.signalStrength;
  }, [rsiData]);

  // 로딩 상태 관리
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (marketData && marketData.length > 0) {
      // 데이터가 있으면 로딩 완료
      setLoading(false);
      setError(null);
    } else {
      // 데이터가 없으면 로딩 중
      setLoading(true);
    }
  }, [marketData, enabled]);

  // 마지막 업데이트 날짜 가져오기
  const lastUpdateDate = useMemo(() => {
    if (marketData && marketData.length > 0) {
      return marketData[marketData.length - 1].date;
    }
    return null;
  }, [marketData]);

  return {
    mode: latestMode.mode,
    rsi: latestMode.rsi,
    prevRSI: latestMode.prevRSI,
    reason: latestMode.reason,
    signalStrength,
    rsiData,
    loading,
    error,
    lastUpdateDate
  };
}

/**
 * RSI 히스토리 데이터를 제공하는 간단한 훅
 * 차트나 분석에 사용
 */
export function useRSIHistory(marketData: MarketData[]): {
  rsiHistory: RSIData[];
  loading: boolean;
} {
  const [loading, setLoading] = useState(true);

  const rsiHistory = useMemo(() => {
    if (!marketData || marketData.length === 0) {
      return [];
    }

    try {
      setLoading(false);
      return enrichDataWithRSI(marketData);
    } catch (err) {
      console.error('RSI 히스토리 계산 오류:', err);
      setLoading(false);
      return [];
    }
  }, [marketData]);

  return {
    rsiHistory,
    loading
  };
}
