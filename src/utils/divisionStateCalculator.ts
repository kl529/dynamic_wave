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

export const calculateDivisionStates = (initialCapital: number = 10000) => {
  if (typeof window === 'undefined') {
    return Array(5).fill(null).map(() => ({
      cash: initialCapital / 5,
      holdings: 0,
      avgPrice: 0,
      buyDate: null,
      status: 'EMPTY' as const,
      mode: 'safe' as const
    }));
  }

  const records: TradeRecord[] = JSON.parse(localStorage.getItem('tradeRecords') || '[]');
  const cashPerDivision = initialCapital / 5;

  // 각 분할별 상태 초기화
  const divisions = Array(5).fill(null).map(() => ({
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
    if (divIndex < 0 || divIndex >= 5) return;

    const div = divisions[divIndex];

    if (record.action === 'BUY') {
      // 매수: 현금 차감, 보유량 증가, 평단가 계산
      const totalCost = div.totalCost + (record.quantity * record.price);
      const totalHoldings = div.holdings + record.quantity;

      div.cash -= record.amount;
      div.holdings = totalHoldings;
      div.totalCost = totalCost;
      div.avgPrice = totalCost / totalHoldings;
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

  return divisions;
};
