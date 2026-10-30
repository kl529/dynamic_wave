import { enrichDataWithWeeklyRSIMode, getWeeklyRSIModeInfo, isoWeekKey, isWeekComplete } from '@/utils/rsiCalculator';
import { isTradingDay, nextTradingDay } from '@/lib/marketTime';
import type { MarketData } from '@/types';

// NYSE 정규장 일봉 (주말·휴장일 제외, 금요일 휴장 주 포함)
function weekdays(n: number): MarketData[] {
  const out: MarketData[] = [];
  let x = 7, p = 50;
  for (let d = Date.UTC(2020, 0, 2); out.length < n; d += 86400000) {
    if (!isTradingDay(new Date(d).toISOString().slice(0, 10))) continue;
    x = (x * 16807) % 2147483647;
    p *= 1 + ((x / 2147483647) - 0.49) * 0.08;
    out.push({ date: new Date(d).toISOString().slice(0, 10), price: p, change: 0, changePercent: 0, volume: 0 });
  }
  return out;
}

describe('isoWeekKey', () => {
  it('연말·연초 경계', () => {
    expect(isoWeekKey('2024-12-30')).toBe('2025-W01');
    expect(isoWeekKey('2025-01-03')).toBe('2025-W01');
    expect(isoWeekKey('2021-01-01')).toBe('2020-W53');
    expect(isoWeekKey('2026-10-30')).toBe('2026-W44');
  });
});

describe('NYSE 휴장일', () => {
  it.each(['2025-04-18', '2026-04-03', '2026-07-03', '2026-11-26', '2026-12-25', '2027-01-01', '2022-06-20', '2021-12-24'])('%s 휴장', d => {
    expect(isTradingDay(d)).toBe(false);
  });
  it.each(['2026-10-30', '2022-01-03', '2021-12-31'])('%s 개장', d => expect(isTradingDay(d)).toBe(true));
  it('목요일 다음이 성금요일이면 다음 정규장은 월요일', () => expect(nextTradingDay('2026-04-02')).toBe('2026-04-06'));
});

describe('isWeekComplete', () => {
  it('금요일 종가가 있으면 완료', () => expect(isWeekComplete('2026-10-30')).toBe(true));
  it('목요일까지면 미완료', () => expect(isWeekComplete('2026-10-29')).toBe(false));
  it('금요일이 휴장이면 목요일 종가로 완료', () => expect(isWeekComplete('2026-04-02')).toBe(true));
});

describe('주간 RSI 모드 — 미래 데이터 미사용', () => {
  const data = weekdays(600);
  const full = enrichDataWithWeeklyRSIMode(data);

  it('t일 모드는 t일 종가와 무관하다 (장 마감 전에 알 수 있어야 함)', () => {
    for (let t = 100; t < data.length; t++) {
      for (const k of [0.5, 2]) {
        const bumped = data.slice(0, t + 1).map((d, i) => (i === t ? { ...d, price: d.price * k } : d));
        expect(enrichDataWithWeeklyRSIMode(bumped)[t].mode).toBe(full[t].mode);
      }
    }
  });

  it('모드는 주 중간에 바뀌지 않는다', () => {
    for (let t = 1; t < data.length; t++) {
      if (isoWeekKey(data[t].date) === isoWeekKey(data[t - 1].date)) expect(full[t].mode).toBe(full[t - 1].mode);
    }
  });

  it('실전 함수(다음 정규장 모드)가 모든 날 백테스트의 다음 날 모드와 같다 (휴장 주 포함)', () => {
    for (let t = 150; t < data.length - 1; t++) {
      expect(getWeeklyRSIModeInfo(data.slice(0, t + 1)).mode).toBe(full[t + 1].mode);
    }
  });
});
