import { DEFAULT_CONFIG } from '@/constants';
import { TradeRecord } from '@/lib/supabase';

export interface DivisionState {
  cash: number;
  holdings: number;
  totalCost: number;
  avgPrice: number;
  buyDate: string | null;
  status: 'EMPTY' | 'HOLDING';
  mode: 'safe' | 'aggressive';
}

// 초기 분할 상태 생성
export const createInitialDivisionStates = (
  initialCapital: number = DEFAULT_CONFIG.initialCapital,
  divisions: number = DEFAULT_CONFIG.divisions
): DivisionState[] => {
  const cashPerDivision = initialCapital / divisions;

  return Array(divisions).fill(null).map(() => ({
    cash: cashPerDivision,
    holdings: 0,
    totalCost: 0,
    avgPrice: 0,
    buyDate: null as string | null,
    status: 'EMPTY' as 'EMPTY' | 'HOLDING',
    mode: 'safe' as const
  }));
};

// Supabase 매매기록 기반으로 분할 상태 계산
export const calculateDivisionStatesFromRecords = (
  records: TradeRecord[],
  initialCapital: number = DEFAULT_CONFIG.initialCapital,
  divisions: number = DEFAULT_CONFIG.divisions
): DivisionState[] => {
  const cashPerDivision = initialCapital / divisions;

  // 각 분할별 상태 초기화
  const divisionStates: DivisionState[] = Array(divisions).fill(null).map(() => ({
    cash: cashPerDivision,
    holdings: 0,
    totalCost: 0,
    avgPrice: 0,
    buyDate: null as string | null,
    status: 'EMPTY' as 'EMPTY' | 'HOLDING',
    mode: 'safe' as const
  }));

  if (!records || records.length === 0) {
    return divisionStates;
  }

  // 거래 기록을 날짜순으로 정렬
  const sortedRecords = [...records].sort((a, b) =>
    new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime()
  );

  // 각 거래를 처리
  sortedRecords.forEach(record => {
    const divIndex = record.division_number - 1;
    if (divIndex < 0 || divIndex >= divisions) return;

    const div = divisionStates[divIndex];

    if (record.trade_type === 'BUY') {
      // 매수: 현금 차감, 보유량 증가, 평단가 계산
      const totalCost = div.totalCost + (record.quantity * record.price);
      const totalHoldings = div.holdings + record.quantity;

      div.cash -= record.amount;
      div.holdings = totalHoldings;
      div.totalCost = totalCost;
      div.avgPrice = totalHoldings > 0 ? totalCost / totalHoldings : 0;
      div.buyDate = record.trade_date;
      div.status = 'HOLDING';

    } else if (record.trade_type === 'SELL') {
      // 매도: 현금 증가, 보유량 감소
      div.cash += record.amount;
      div.holdings -= record.quantity;

      if (div.holdings <= 0) {
        // 전량 매도
        div.holdings = 0;
        div.totalCost = 0;
        div.avgPrice = 0;
        div.buyDate = null;
        div.status = 'EMPTY';
      } else {
        // 부분 매도: 비용 비례 감소
        div.totalCost = div.holdings * div.avgPrice;
      }
    }
  });

  return divisionStates;
};
