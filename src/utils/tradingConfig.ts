/**
 * 동파법 거래 설정 및 공통 유틸리티
 */

// 수수료 설정
export const FEES = {
  commission: 0.00044,  // 0.044% 거래 수수료
  secFee: 0.0000278     // 0.00278% SEC 수수료
} as const;

// 총 수수료율 (편도)
export const getTotalFeeRate = (): number => {
  return FEES.commission + FEES.secFee; // 0.047%
};

// 모드별 거래 설정
export interface ModeConfig {
  sellTarget: number;    // 목표 수익률
  buyTarget: number;     // 목표 상승률
  holdingDays: number;   // 최대 보유 거래일
  profitReinvest: number;  // 이익 복리
  lossReinvest: number;    // 손실 복리
}

const MODE_CONFIGS: Record<'safe' | 'aggressive', ModeConfig> = {
  safe: {
    sellTarget: 0.002,    // 0.2% 수익에서 매도
    buyTarget: 0.03,      // 3.0% 상승에서 매수
    holdingDays: 30,      // 최대 30 거래일 보유
    profitReinvest: 0.8,  // 이익복리 80%
    lossReinvest: 0.3     // 손실복리 30%
  },
  aggressive: {
    sellTarget: 0.025,    // 2.5% 수익에서 매도
    buyTarget: 0.05,      // 5.0% 상승에서 매수
    holdingDays: 7,       // 최대 7 거래일 보유
    profitReinvest: 0.8,  // 이익복리 80%
    lossReinvest: 0.3     // 손실복리 30%
  }
};

export const getModeConfig = (mode: 'safe' | 'aggressive'): ModeConfig => {
  return MODE_CONFIGS[mode];
};

/**
 * 거래일(영업일) 계산 - 주말 제외
 */
export const calculateTradingDays = (startDate: string, endDate: string): number => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  let tradingDays = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // 주말(토요일=6, 일요일=0) 제외
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      tradingDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return tradingDays;
};

/**
 * 수수료 계산
 */
export const calculateCommission = (amount: number): number => {
  return amount * getTotalFeeRate();
};
