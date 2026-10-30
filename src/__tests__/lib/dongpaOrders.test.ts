import { dongpaOrders } from '@/lib/dongpaOrders';
import { DivisionEngine } from '@/services/divisionEngine';
import type { DivisionState } from '@/utils/divisionStateCalculator';
import type { DivisionPortfolio } from '@/types';

// 2026-10-26(월) 매수 분할, 2026-09-01 매수 분할(20거래일 초과), 빈 분할
const SESSION = '2026-10-29';
const states: DivisionState[] = [
  { cash: 0, holdings: 10, totalCost: 1000, avgPrice: 100, buyDate: '2026-10-26', status: 'HOLDING', mode: 'safe' },
  { cash: 0, holdings: 5, totalCost: 600, avgPrice: 120, buyDate: '2026-09-01', status: 'HOLDING', mode: 'safe' },
  { cash: 1000, holdings: 0, totalCost: 0, avgPrice: 0, buyDate: null, status: 'EMPTY', mode: 'safe' },
  { cash: 1000, holdings: 0, totalCost: 0, avgPrice: 0, buyDate: null, status: 'EMPTY', mode: 'safe' },
];

const toPortfolio = (s: DivisionState, i: number): DivisionPortfolio => ({
  divisionName: `분할${i + 1}`, divisionNumber: i + 1, status: s.status, cash: s.cash, holdings: s.holdings,
  avgPrice: s.avgPrice, buyDate: s.buyDate ?? '', buyPrice: s.avgPrice, totalCost: s.totalCost,
  currentValue: 0, unrealizedPL: 0, unrealizedPLRate: 0, buyLimitPrice: 0, sellLimitPrice: 0, tradingDaysHeld: 0,
});

/** 주문표를 종가 close 에 적용했을 때 체결되는 것 */
function fills(close: number, prevClose: number) {
  return dongpaOrders(states, prevClose, 'safe', SESSION)
    .filter(o => o.type === 'MOC' || (o.side === 'SELL' ? close >= o.limitPrice! : close <= o.limitPrice!))
    .map(o => `${o.division}:${o.side}:${o.quantity}`)
    .sort();
}

/** 백테스트 엔진이 같은 날 같은 종가로 하는 매매 */
function engineTrades(close: number, prevClose: number) {
  const engine = new DivisionEngine({ initialCapital: 4000, divisions: 4, mode: 'safe', rebalancePeriod: 10 });
  const rec = engine.processDailyTrade(SESSION, close, prevClose, states.map(toPortfolio), 1);
  return rec.divisionActions.map(a => `${a.divisionNumber}:${a.action === 'BUY' ? 'BUY' : 'SELL'}:${a.quantity}`).sort();
}

describe('dongpaOrders ↔ DivisionEngine 일치', () => {
  // safe: 매수 -3%, 매도 +2%, 최대 20거래일
  it.each([95, 96.9, 97, 99, 101.9, 102, 104])('종가 %p 에서 같은 주문이 체결된다', close => {
    expect(fills(close, 100)).toEqual(engineTrades(close, 100));
  });

  it('LOC 매도는 지정가가 아니라 종가에 체결된다', () => {
    const engine = new DivisionEngine({ initialCapital: 4000, divisions: 4, mode: 'safe', rebalancePeriod: 10 });
    const rec = engine.processDailyTrade(SESSION, 110, 100, states.map(toPortfolio), 1);
    const sell = rec.divisionActions.find(a => a.divisionNumber === 1)!;
    expect(sell.price).toBe(110);
    expect(sell.limitPrice).toBeCloseTo(102);
  });

  it('LOC 매수 수량은 지정가 기준이라 종가가 더 낮아도 현금을 넘지 않는다', () => {
    const buy = dongpaOrders(states, 100, 'safe', SESSION).find(o => o.side === 'BUY')!;
    expect(buy.division).toBe(3);
    expect(buy.limitPrice).toBeCloseTo(97);
    expect(buy.quantity * 97).toBeLessThanOrEqual(1000);
  });

  it('현금모드: 보유 분할 전량 MOC 매도, 매수 없음', () => {
    const orders = dongpaOrders(states, 100, 'cash', SESSION);
    expect(orders.map(o => `${o.division}:${o.side}:${o.type}`)).toEqual(['1:SELL:MOC', '2:SELL:MOC']);
  });
});
