import { filteredEnsemble, sma, trendEnsemble, volScale } from '@/lib/trend';
import { strategySignal, rebalanceOrder, todayOrder, STRATEGY } from '@/lib/strategy';

// 결정적인 의사난수 가격 경로 (추세 + 변동)
function series(n: number, seed = 1) {
  let x = seed, p = 100;
  return Array.from({ length: n }, (_, i) => {
    x = (x * 16807) % 2147483647;
    p *= 1 + ((x / 2147483647) - 0.48) * 0.04;
    const d = new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    return { date: d, price: p };
  });
}

describe('trend', () => {
  it('sma: 앞 n-1개는 NaN, 이후는 산술평균', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([NaN, 1.5, 2.5, 3.5]);
  });

  it('trendEnsemble: t일 값은 t일까지의 데이터로만 정해진다 (미래 데이터 미사용)', () => {
    const closes = series(700).map(d => d.price);
    const full = trendEnsemble(closes, [...STRATEGY.periods]);
    for (const t of [300, 450, 699]) {
      const prefix = trendEnsemble(closes.slice(0, t + 1), [...STRATEGY.periods]);
      expect(prefix[t]).toBe(full[t]);
    }
  });

  it('trendEnsemble: 0, 0.2, …, 1 중 하나', () => {
    const e = trendEnsemble(series(700).map(d => d.price), [...STRATEGY.periods]);
    e.forEach(v => expect([0, 0.2, 0.4, 0.6, 0.8, 1].some(k => Math.abs(k - v) < 1e-12)).toBe(true));
  });
});

describe('volScale (변동성 필터)', () => {
  // 앞 600일은 잔잔하고 이후 200일은 크게 흔들리는 지수
  const calmThenWild = (() => {
    let x = 3, p = 100;
    return Array.from({ length: 800 }, (_, i) => {
      x = (x * 16807) % 2147483647;
      p *= 1 + ((x / 2147483647) - 0.5) * (i < 600 ? 0.01 : 0.08);
      return p;
    });
  })();

  it('t일 값은 t일까지의 데이터로만 정해진다 (미래 데이터 미사용)', () => {
    const full = volScale(calmThenWild);
    for (const t of [300, 610, 799]) expect(volScale(calmThenWild.slice(0, t + 1))[t]).toBe(full[t]);
  });

  it('평소보다 크게 흔들리면 1보다 작아지고, 값은 0~1', () => {
    const v = volScale(calmThenWild);
    v.forEach(x => { expect(x).toBeGreaterThan(0); expect(x).toBeLessThanOrEqual(1); });
    expect(v[650]).toBeLessThan(0.5);
    expect(v[400]).toBe(1);
  });

  it('값이 250개 쌓이기 전에는 축소하지 않는다', () => {
    expect(volScale(calmThenWild).slice(0, 270).every(x => x === 1)).toBe(true);
  });

  it('filteredEnsemble 은 20%p 단위', () => {
    filteredEnsemble(calmThenWild, [...STRATEGY.periods]).forEach(e => expect([0, 0.2, 0.4, 0.6, 0.8, 1].some(k => Math.abs(k - e) < 1e-12)).toBe(true));
  });
});

describe('strategySignal', () => {
  it('300일 미만이면 신호 없음', () => {
    expect(strategySignal(series(300))).toBeNull();
  });

  it('다음 거래일 목표 = 마지막 날 (추세 × 변동성) 비중, 현재 = 전일 비중 (검증 스크립트의 1일 지연과 동일)', () => {
    const data = series(700);
    const closes = data.map(d => d.price);
    const f = filteredEnsemble(closes, [...STRATEGY.periods], STRATEGY.volWindow);
    const s = strategySignal(data)!;
    expect(s.asOf).toBe(data[699].date);
    expect(s.target).toBe(f[699]);
    expect(s.current).toBe(f[698]);
    expect(s.trend).toBe(trendEnsemble(closes, [...STRATEGY.periods])[699]);
    expect(s.averages.filter(a => a.above).length / STRATEGY.periods.length).toBe(s.trend);
    expect(s.target).toBe(Math.round(s.trend * s.volFactor * 5) / 5);
  });
});

describe('rebalanceOrder', () => {
  it('현금만 있을 때 목표 비중만큼 매수 (수수료만큼 내림)', () => {
    expect(rebalanceOrder(0.6, 100, 0, 10000)).toBe(59);
  });
  it('보유만 있고 목표 0이면 전량 매도', () => {
    expect(rebalanceOrder(0, 100, 50, 0)).toBe(-50);
  });
  it('목표 비중에 이미 맞으면 0', () => {
    expect(rebalanceOrder(0.5, 100, 49, 5100)).toBe(0);
  });
});

describe('todayOrder', () => {
  it('목표 비중이 그대로이고 계좌가 목표 근처면 주문 없음 (가격 변동 차이는 맞추지 않음)', () => {
    // 목표 60%, 계좌 비중 약 64% (주가 상승으로 벌어짐)
    expect(todayOrder({ target: 0.6, current: 0.6 }, 110, 58, 3600)).toBe(0);
  });
  it('목표 비중이 바뀌면 맞춘다', () => {
    expect(todayOrder({ target: 0.4, current: 0.6 }, 100, 60, 4000)).toBe(-21);
  });
  it('처음 시작(현금만)이면 목표가 그대로여도 맞춘다', () => {
    expect(todayOrder({ target: 0.8, current: 0.8 }, 100, 0, 10000)).toBe(79);
  });
});
