/**
 * 추천 전략: 나스닥100 2배(QLD) 추세 앙상블.
 * ^NDX 종가가 SMA 100/150/200/250/300 중 몇 개 위에 있는지의 비율만큼 QLD를 보유하고 나머지는 현금.
 * 근거와 한계: docs/STRATEGY.md, 검증 수치: docs/validation/results.md
 */
import { sma, trendEnsemble } from '@/lib/trend';
import { getTotalFeeRate } from '@/utils/tradingConfig';

export const STRATEGY = {
  name: '나스닥100 2배 추세 앙상블',
  signalSymbol: '^NDX',
  tradeSymbol: 'QLD',
  periods: [100, 150, 200, 250, 300],
} as const;

export interface StrategySignal {
  asOf: string;            // 신호 계산에 쓴 마지막 확정 종가 날짜
  close: number;
  averages: { period: number; value: number; above: boolean; gapPct: number }[];
  target: number;          // 다음 거래일 종가에 맞출 QLD 비중 (0~1)
  current: number;         // 오늘 종가 기준으로 맞춰져 있어야 할 비중 (전일 신호)
}

/**
 * 확정 종가까지의 ^NDX 데이터로 다음 거래일 목표 비중을 계산한다.
 * 검증 스크립트와 같은 trendEnsemble 함수를 쓰므로 백테스트와 실전 신호가 같다.
 */
export function strategySignal(index: { date: string; price: number }[]): StrategySignal | null {
  const longest = Math.max(...STRATEGY.periods);
  if (index.length < longest + 1) return null;
  const closes = index.map(d => d.price);
  const ensemble = trendEnsemble(closes, [...STRATEGY.periods]);
  const last = closes.length - 1;
  return {
    asOf: index[last].date,
    close: closes[last],
    averages: STRATEGY.periods.map(period => {
      const value = sma(closes, period)[last];
      return { period, value, above: closes[last] > value, gapPct: (closes[last] / value - 1) * 100 };
    }),
    target: ensemble[last],
    current: ensemble[last - 1],
  };
}

/**
 * 목표 비중을 맞추기 위한 QLD 주문 수량 (+매수 / -매도). 계좌 = 보유 주식 + 현금(USD).
 * 체결은 다음 종가라 수량은 오늘 종가 기준 근사치다. 수수료만큼 낮춰 잡는다.
 */
export function rebalanceOrder(target: number, price: number, shares: number, cash: number): number {
  const equity = shares * price + cash;
  return Math.floor((target * equity) / (price * (1 + getTotalFeeRate()))) - shares;
}

/**
 * 다음 정규장에 넣을 QLD 주문 수량. 백테스트처럼 목표 비중이 바뀐 날에만 맞춘다.
 * 예외: 계좌 비중이 목표와 10%p 이상 벌어져 있으면(처음 시작, 입출금 등) 그날 맞춘다.
 */
export function todayOrder(signal: Pick<StrategySignal, 'target' | 'current'>, price: number, shares: number, cash: number): number {
  const equity = shares * price + cash;
  if (equity <= 0) return 0;
  const weight = (shares * price) / equity;
  const needed = signal.target !== signal.current || Math.abs(weight - signal.target) >= 0.1;
  return needed ? rebalanceOrder(signal.target, price, shares, cash) : 0;
}
