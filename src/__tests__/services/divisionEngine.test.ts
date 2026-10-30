import { DivisionEngine } from '@/services/divisionEngine';
import { enrichDataWithWeeklyRSIMode } from '@/utils/rsiCalculator';
import type { MarketData } from '@/types';

// 변동성 큰 평일 가격 경로 (매수·매도·손절·현금모드가 모두 일어나도록)
function path(n: number): MarketData[] {
  const out: MarketData[] = [];
  let x = 11, p = 40;
  for (let d = Date.UTC(2021, 0, 4); out.length < n; d += 86400000) {
    const dow = new Date(d).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    x = (x * 16807) % 2147483647;
    p *= 1 + ((x / 2147483647) - 0.5) * 0.14;
    out.push({ date: new Date(d).toISOString().slice(0, 10), price: p, change: 0, changePercent: 0, volume: 0 });
  }
  return out;
}

describe('DivisionEngine 총자산', () => {
  it.each([false, true])('매일 totalAssets = 현금 + 보유주 × 종가 (hybrid=%p)', hybrid => {
    const data = path(700);
    const modes = new Map(enrichDataWithWeeklyRSIMode(data).map(d => [d.date, d.mode]));
    const recs = new DivisionEngine({ initialCapital: 100000, divisions: 10, mode: 'auto', rebalancePeriod: 10, hybrid }).backtest(data, modes);
    expect(recs.some(r => r.divisionActions.length > 0)).toBe(true);
    for (const r of recs) {
      const shares = hybrid && r.stratMode === 'bnh' ? r.totalHoldings : r.divisionPortfolios.reduce((a, d) => a + d.holdings, 0);
      expect(r.totalAssets).toBeCloseTo(r.totalCash + shares * r.closePrice, 6);
    }
  });
});
