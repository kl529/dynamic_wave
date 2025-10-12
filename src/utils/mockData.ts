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

// localStorage 초기화
export const initializeMockData = () => {
  if (typeof window === 'undefined') return;

  // 매매 기록이 없으면 더미 데이터 추가
  const existingRecords = localStorage.getItem('tradeRecords');
  if (!existingRecords) {
    localStorage.setItem('tradeRecords', JSON.stringify(generateMockTradeRecords()));
  }
};
