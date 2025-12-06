export interface DongpaConfig {
  initialCapital: number;
  divisions: number;
  mode: 'safe' | 'aggressive';
  rebalancePeriod: number; // N일마다 재분할 (기본: 10일)
}

// 분할별 포트폴리오 상태
export interface DivisionPortfolio {
  divisionName: string;     // 분할 이름 (예: "분할1", "분할2")
  divisionNumber: number;   // 분할 번호 (1~N)
  status: 'EMPTY' | 'HOLDING'; // 상태: 비어있음 / 보유중
  cash: number;             // 가용 현금
  holdings: number;         // 보유 주식수
  avgPrice: number;         // 평단가
  buyDate: string;          // 매수일 (거래일 계산용)
  buyPrice: number;         // 실제 매수가
  totalCost: number;        // 총 매수금액 (수수료 포함)

  // 현재 상태
  currentValue: number;     // 현재 평가금액
  unrealizedPL: number;     // 평가손익
  unrealizedPLRate: number; // 평가손익률

  // 매매 신호
  buyLimitPrice: number;    // 매수 지정가
  sellLimitPrice: number;   // 매도 지정가
  tradingDaysHeld: number;  // 거래일 기준 보유일수
}

export interface ModeConfig {
  sellTarget: number;    // 매도 목표 수익률
  buyTarget: number;     // 매수 목표 하락률
  holdingDays: number;   // 최대 보유 거래일수 (주말 제외)
}

export interface MarketData {
  date: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high?: number;
  low?: number;
  open?: number;
}

export interface Trade {
  key: number;
  date: string;
  price: number;
  change: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  quantity: number;
  amount: number;
  commission: number;
  profit: number;
  cash: number;
  holdings: number;
  avgPrice: number;
  currentValue: number;
  totalAssets: number;
  returnRate: number;
  drawdown: number;
}

// 엑셀 동파법 전용 Trade 인터페이스
export interface DongpaTrade {
  거래일자: string;
  종가: number;
  매매모드: 'safe' | 'aggressive';
  변동률: number;
  매수예정: number;
  매수지정가: number;     // 지정가 매수 주문 가격
  목표량: number;
  매수가: number;
  매수량: number;
  매수금액: number;
  매수수수료: number;
  매도지정가: number;     // 지정가 매도 주문 가격
  목표가: number;
  매수일자: string;       // 매수 시작 날짜 (거래일 계산용)
  거래일보유기간: number; // 거래일 기준 보유기간
  MOC: string;
  매도일: string;
  매도가: number;
  매도량: number;
  매도금액: number;
  매도수수료: number;
  당일실현손익금액: number;
  손익률: number;
  손절여부: boolean;      // 최대 보유기간 도달 손절 여부
  누적손익: number;
  갱신복리금액: number;
  자금갱신: boolean;
  시드: number;
  증액입출금: number;
  예수금: number;
  보유량: number;
  평가금: number;
  총자산: number;
  수익률: number;
  DD: number;
  평단가: number;
  최고자산: number;
}

// 오늘 매매 신호 인터페이스 (종가매매 LOC 방식)
export interface TodaySignal {
  매수신호: {
    신호: 'BUY' | 'HOLD';
    매수량: number;
    매수가: number;          // LOC 체결가 (오늘 종가)
    매수금액: number;
    수수료: number;
    하락률: number;          // 전일 대비 오늘 하락률 (%)
    목표하락률: number;       // 매수 조건 하락률 (%)
    메시지: string;
  };
  매도신호: {
    신호: 'SELL' | 'STOP_LOSS' | 'HOLD' | 'NO_POSITION';
    매도량: number;
    매도가: number;          // LOC 체결가 (오늘 종가)
    매도금액: number;
    수수료: number;
    실현수익: number;
    수익률: number;          // 평단가 대비 오늘 종가 수익률 (%)
    목표수익률: number;       // 매도 조건 수익률 (%)
    거래일보유기간: number;  // 거래일 기준 보유기간
    메시지: string;
    손절여부: boolean;       // 손절 매도인지 여부
  };
}

export interface Portfolio {
  cash: number;
  holdings: number;
  avgPrice: number;
  totalCost: number;
  peakValue: number;
  maxDrawdown: number;
}

export interface TradingSummary {
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalCommission: number;
  finalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

export interface BacktestResult {
  trades: Trade[];
  portfolio: Portfolio;
  summary: TradingSummary;
}

// 분할별 매매 액션
export interface DivisionAction {
  divisionName: string;
  divisionNumber: number;
  action: 'BUY' | 'SELL' | 'STOP_LOSS' | 'HOLD';
  quantity: number;
  price: number;
  limitPrice: number;      // 지정가
  amount: number;
  commission: number;
  profit?: number;         // 매도시에만
  profitRate?: number;     // 매도시에만
  tradingDaysHeld?: number; // 매도시에만
  reason: string;
}

// 일별 전체 매매 기록 (모든 분할 포함)
export interface DailyTradeRecord {
  date: string;
  closePrice: number;
  prevClosePrice: number;
  changeRate: number;
  mode: 'safe' | 'aggressive'; // 해당 날짜의 매매 모드 (RSI 기반)

  // 분할별 액션
  divisionActions: DivisionAction[];

  // 전체 포트폴리오 현황
  divisionPortfolios: DivisionPortfolio[];

  // 당일 집계
  totalBuyQuantity: number;
  totalSellQuantity: number;
  netQuantity: number;
  dailyRealizedPL: number;

  // 전체 자산
  totalCash: number;
  totalHoldings: number;
  totalValue: number;
  totalAssets: number;
  returnRate: number;

  // 재분할 여부
  isRebalanceDay: boolean;
  rebalanceAmount?: number;
}

export interface RealtimeQuote {
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: Date;
  high?: number;
  low?: number;
  open?: number;
}