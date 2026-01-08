import { DEFAULT_CONFIG } from '@/constants';

// 안전한 JSON 파싱
const safeJsonParse = <T,>(json: string | null, fallback: T): T => {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
};

// 실제 거래 기록 기반으로 분할 상태 계산
interface TradeRecord {
  id: number;
  date: string;
  division: number;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  amount: number;
  comment: string;
  createdAt: string;
}

export const calculateDivisionStates = (
  initialCapital: number = DEFAULT_CONFIG.initialCapital,
  divisions: number = DEFAULT_CONFIG.divisions
) => {
  if (typeof window === 'undefined') {
    return Array(divisions).fill(null).map(() => ({
      cash: initialCapital / divisions,
      holdings: 0,
      totalCost: 0,
      avgPrice: 0,
      buyDate: null as string | null,
      status: 'EMPTY' as 'EMPTY' | 'HOLDING',
      mode: 'safe' as const
    }));
  }

  const records: TradeRecord[] = safeJsonParse(localStorage.getItem('tradeRecords'), []);
  const cashPerDivision = initialCapital / divisions;

  // 각 분할별 상태 초기화
  const divisionStates = Array(divisions).fill(null).map(() => ({
    cash: cashPerDivision,
    holdings: 0,
    totalCost: 0,
    avgPrice: 0,
    buyDate: null as string | null,
    status: 'EMPTY' as 'EMPTY' | 'HOLDING',
    mode: 'safe' as const
  }));

  // 거래 기록을 날짜순으로 정렬
  const sortedRecords = [...records].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // 각 거래를 처리
  sortedRecords.forEach(record => {
    const divIndex = record.division - 1;
    if (divIndex < 0 || divIndex >= divisions) return;

    const div = divisionStates[divIndex];

    if (record.action === 'BUY') {
      // 매수: 현금 차감, 보유량 증가, 평단가 계산
      const totalCost = div.totalCost + (record.quantity * record.price);
      const totalHoldings = div.holdings + record.quantity;

      div.cash -= record.amount;
      div.holdings = totalHoldings;
      div.totalCost = totalCost;
      div.avgPrice = totalHoldings > 0 ? totalCost / totalHoldings : 0;
      div.buyDate = record.date;
      div.status = 'HOLDING';

    } else if (record.action === 'SELL') {
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
