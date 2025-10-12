export interface DongpaConfig {
  initialCapital: number;
  divisions: number;
  mode: 'safe' | 'aggressive';
}

export interface ModeConfig {
  sellTarget: number;
  buyTarget: number;
  holdingDays: number;
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
  LOC매수목표: number;
  목표량: number;
  매수가: number;
  매수량: number;
  매수금액: number;
  매수수수료: number;
  목표가: number;
  MOC: string;
  매도일: string;
  매도가: number;
  매도량: number;
  매도금액: number;
  매도수수료: number;
  당일실현손익금액: number;
  손익률: number;
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

// 오늘 매매 신호 인터페이스
export interface TodaySignal {
  매수신호: {
    신호: 'BUY' | 'HOLD';
    매수량: number;
    매수가: number;
    매수금액: number;
    수수료: number;
    다음매수가: number;
    메시지: string;
  };
  매도신호: {
    신호: 'SELL' | 'HOLD' | 'NO_POSITION';
    매도량: number;
    매도가: number;
    매도금액: number;
    수수료: number;
    예상수익: number;
    목표가: number;
    필요상승률: number;
    메시지: string;
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