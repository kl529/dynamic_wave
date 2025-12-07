// 더미 데이터 생성 유틸

export const generateMockDivisions = () => {
  return [
    {
      cash: 0,
      holdings: 68,
      avgPrice: 29.10,
      buyDate: '2025-01-07',
      status: 'HOLDING' as const,
      mode: 'safe' as const
    },
    {
      cash: 0,
      holdings: 72,
      avgPrice: 27.85,
      buyDate: '2025-01-09',
      status: 'HOLDING' as const,
      mode: 'safe' as const
    },
    {
      cash: 2000,
      holdings: 0,
      avgPrice: 0,
      buyDate: null,
      status: 'EMPTY' as const,
      mode: 'safe' as const
    },
    {
      cash: 2000,
      holdings: 0,
      avgPrice: 0,
      buyDate: null,
      status: 'EMPTY' as const,
      mode: 'safe' as const
    },
    {
      cash: 0,
      holdings: 65,
      avgPrice: 30.50,
      buyDate: '2025-01-06',
      status: 'HOLDING' as const,
      mode: 'safe' as const
    }
  ];
};

export const generateMockTradeRecords = () => {
  return [
    {
      id: 1,
      date: '2025-01-10',
      division: 2,
      action: 'BUY',
      quantity: 72,
      price: 27.85,
      amount: 2005.20,
      comment: '5% 하락으로 2분할 매수',
      createdAt: '2025-01-10T15:30:00Z'
    },
    {
      id: 2,
      date: '2025-01-09',
      division: 3,
      action: 'SELL',
      quantity: 70,
      price: 28.20,
      amount: 1974.00,
      comment: '0.5% 수익 실현',
      createdAt: '2025-01-09T16:00:00Z'
    },
    {
      id: 3,
      date: '2025-01-07',
      division: 1,
      action: 'BUY',
      quantity: 68,
      price: 29.10,
      amount: 1978.80,
      comment: '3.2% 하락으로 1분할 매수',
      createdAt: '2025-01-07T15:30:00Z'
    },
    {
      id: 4,
      date: '2025-01-06',
      division: 5,
      action: 'BUY',
      quantity: 65,
      price: 30.50,
      amount: 1982.50,
      comment: '초기 매수',
      createdAt: '2025-01-06T15:30:00Z'
    },
    {
      id: 5,
      date: '2025-01-05',
      division: 4,
      action: 'SELL',
      quantity: 63,
      price: 31.20,
      amount: 1965.60,
      comment: '1.2% 수익 실현',
      createdAt: '2025-01-05T16:00:00Z'
    }
  ];
};

// 현재 종가 데이터
export const getMockClosingPrices = () => {
  return {
    yesterday: 28.50, // 어제 종가
    today: 27.85,     // 오늘 종가
    change: -0.65,    // 변화량
    changePercent: -2.28 // 변화율 (%)
  };
};

// localStorage 초기화 (더미 데이터 추가하지 않음)
export const initializeMockData = () => {
  if (typeof window === 'undefined') return;

  // 매매 기록이 없으면 빈 배열로 초기화
  const existingRecords = localStorage.getItem('tradeRecords');
  if (!existingRecords) {
    localStorage.setItem('tradeRecords', JSON.stringify([]));
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
