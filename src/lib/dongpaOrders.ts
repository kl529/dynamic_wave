/**
 * 동파법 다음 정규장 주문표.
 * 백테스트 엔진(DivisionEngine)이 하루에 하는 판단을 장 마감 전에 넣을 수 있는 조건부 주문으로 바꾼 것이다.
 *   매도: 현금모드 → MOC 전량, 보유일 도달 → MOC 손절, 그 외 → LOC 지정가 평단×(1+목표)
 *   매수: 첫 번째 빈 분할 1개, LOC 지정가 전일종가×(1+매수기준), 수량 = 현금 ÷ 지정가
 * 엔진과 다른 점: 매수 분할 순번은 '첫 번째 빈 분할', 재분할(rebalance)은 하지 않는다.
 * session 은 주문이 체결될 정규장 날짜 (nextTradingDay 로 구한다).
 */
import { TRADING } from '@/constants';
import { calculateTradingDays, getModeConfig, getTotalFeeRate } from '@/utils/tradingConfig';
import type { DivisionState } from '@/utils/divisionStateCalculator';

export type DongpaMode = 'safe' | 'aggressive' | 'bull' | 'cash';

export interface DongpaOrder {
  division: number;        // 1부터
  side: 'BUY' | 'SELL';
  type: 'LOC' | 'MOC';
  quantity: number;
  limitPrice?: number;     // LOC 지정가
  reason: string;
}

export function dongpaOrders(
  divisions: DivisionState[],
  lastClose: number,
  mode: DongpaMode,
  session: string
): DongpaOrder[] {
  const cfg = getModeConfig(mode === 'cash' ? 'safe' : mode);
  const orders: DongpaOrder[] = [];

  divisions.forEach((d, i) => {
    if (d.status !== 'HOLDING' || d.holdings <= 0) return;
    const held = d.buyDate ? calculateTradingDays(d.buyDate, session) : 0;
    if (mode === 'cash') {
      orders.push({ division: i + 1, side: 'SELL', type: 'MOC', quantity: d.holdings, reason: '현금모드 — 전량 청산' });
    } else if (held >= cfg.holdingDays) {
      orders.push({ division: i + 1, side: 'SELL', type: 'MOC', quantity: d.holdings, reason: `보유 ${held}거래일 ≥ ${cfg.holdingDays}일 — 손절` });
    } else {
      orders.push({
        division: i + 1, side: 'SELL', type: 'LOC', quantity: d.holdings,
        limitPrice: d.avgPrice * (1 + cfg.sellTarget),
        reason: `평단 +${(cfg.sellTarget * 100).toFixed(1)}% 이상으로 마감하면 종가 매도 (보유 ${held}일째)`,
      });
    }
  });

  const empty = divisions.findIndex(d => d.status === 'EMPTY');
  if (mode !== 'cash' && empty >= 0 && divisions[empty].cash >= TRADING.MIN_CASH_FOR_TRADE) {
    const limitPrice = lastClose * (1 + cfg.buyTarget);
    const quantity = Math.floor(divisions[empty].cash / (limitPrice * (1 + getTotalFeeRate())));
    if (quantity > 0) {
      orders.push({
        division: empty + 1, side: 'BUY', type: 'LOC', quantity, limitPrice,
        reason: `전일 대비 ${(cfg.buyTarget * 100).toFixed(1)}% 이하로 마감하면 종가 매수`,
      });
    }
  }

  return orders;
}
