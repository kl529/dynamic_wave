'use client'

import { useCallback, useEffect, useState } from 'react';
import { MarketData } from '@/types';
import { MarketDataService, MarketSymbol } from '@/services/marketDataService';

/** 확정 일봉을 불러오고, 탭으로 돌아올 때마다 다시 불러온다 (장 마감 후 새 종가 반영) */
export function useMarketHistory(symbol: MarketSymbol, days: number) {
  const [data, setData] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await MarketDataService.getHistory(symbol, days));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [symbol, days]);

  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  return { data, loading, error };
}
