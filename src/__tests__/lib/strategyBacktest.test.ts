import { effectiveStart, strategyBacktest } from '@/lib/strategyBacktest';

const days = (n: number, start: string, f: (i: number) => number) => {
  const out: { date: string; price: number }[] = [];
  for (let d = Date.parse(`${start}T00:00:00Z`); out.length < n; d += 86400000) {
    const dow = new Date(d).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push({ date: new Date(d).toISOString().slice(0, 10), price: f(out.length) });
  }
  return out;
};

describe('strategyBacktest', () => {
  const index = days(900, '2020-01-01', i => 100 * 1.001 ** i);       // 꾸준히 오르는 지수
  const product = index.slice(400).map(b => ({ ...b, price: b.price * 2 }));
  const spy = index.map(b => ({ ...b }));
  const base = { product: 'QLD' as const, periods: [100, 150, 200, 250, 300], weekly: false, tax: false, from: '2019-01-01', to: '2099-12-31', capital: 10000 };

  it('시작일은 이동평균 워밍업·상품 상장일 이후로 밀린다', () => {
    expect(effectiveStart(base, { index, product, spy })).toBe(product[0].date);
    expect(effectiveStart({ ...base, periods: [500] }, { index, product, spy })).toBe(index[500].date);
  });

  it('계속 오르는 시장에서는 전략이 100% 보유와 같다', () => {
    const r = strategyBacktest(base, { index, product, spy });
    const [strategy, hold] = r.lines;
    expect(r.exposure.every(e => e.value === 1)).toBe(true);
    expect(strategy.final).toBeCloseTo(hold.final, 6);
  });

  it('세금을 켜면 최종 자산이 줄어든다 (청산 시 22%)', () => {
    const off = strategyBacktest(base, { index, product, spy }).lines[0].final;
    const on = strategyBacktest({ ...base, tax: true }, { index, product, spy }).lines[0].final;
    // 매수 수수료만큼 취득가가 달라 몇 달러 차이는 난다
    expect(on).toBeCloseTo(10000 + (off - 10000) * 0.78, -1);
  });
});
