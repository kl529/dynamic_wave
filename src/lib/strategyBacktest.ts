/**
 * 추천 전략(추세 앙상블) 백테스트. 앱 백테스팅 화면이 쓰고, 계산은 검증 스크립트와 같은 함수다.
 * 신호: ^NDX 종가가 이동평균들 위에 있는 비율 → 다음 거래일 종가에 상품 비중을 맞춘다.
 */
import {
  Series, Stats, applyTax, ensembleExposure, runExposure, sliceRun, stats, trendExposure, weeklyOnly,
} from '@/lib/backtest';

export type Product = 'QQQ' | 'QLD' | 'TQQQ';

export interface StrategyBacktestInput {
  product: Product;
  periods: number[];
  weekly: boolean;   // 주 1회만 조정
  tax: boolean;      // 양도세 22% (연 실현이익, 마지막 날 청산)
  from: string;
  to: string;
  capital: number;
}

export interface BacktestLine {
  key: 'strategy' | 'hold' | 'spy';
  dates: string[];
  values: number[];  // 자산 (capital 기준)
  final: number;
  stats: Stats;
}

export const TAX_RATE = 0.22;

/** 이동평균이 계산되고 상품·S&P500 데이터가 모두 있는 첫날 이후로 시작일을 맞춘다 */
export function effectiveStart(input: StrategyBacktestInput, data: { index: Series; product: Series; spy: Series }): string {
  const warm = data.index[Math.max(...input.periods)]?.date ?? '9999-12-31';
  return [input.from, warm, data.product[0]?.date ?? '9999-12-31', data.spy[0]?.date ?? '9999-12-31'].sort().pop()!;
}

export function strategyBacktest(input: StrategyBacktestInput, data: { index: Series; product: Series; spy: Series }) {
  const from = effectiveStart(input, data);
  const ones = (s: Series) => s.map(() => 1);
  const product = data.product;
  let exposure = input.periods.length === 1
    ? trendExposure(product, data.index, input.periods[0])
    : ensembleExposure(product, data.index, input.periods);
  if (input.weekly) exposure = weeklyOnly(product, exposure);

  const line = (key: BacktestLine['key'], s: Series, exp: number[]): BacktestLine => {
    const run = sliceRun(runExposure(s, exp), from, input.to);
    const taxed = input.tax ? applyTax(run, TAX_RATE) : { equity: run.equity, finalAfterTax: run.equity[run.equity.length - 1] };
    return {
      key, dates: run.dates,
      values: taxed.equity.map(v => v * input.capital),
      final: taxed.finalAfterTax * input.capital,
      stats: stats(run.dates, taxed.equity, run.shares, taxed.finalAfterTax),
    };
  };

  const strategy = line('strategy', product, exposure);
  const start = product.findIndex(b => b.date >= from);
  return {
    from,
    to: strategy.dates[strategy.dates.length - 1],
    lines: [strategy, line('hold', product, ones(product)), line('spy', data.spy, ones(data.spy))],
    exposure: product.slice(start).filter(b => b.date <= input.to).map((b, i) => ({ date: b.date, value: exposure[start + i] })),
  };
}
