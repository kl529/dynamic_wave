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
  sellTarget: number;    // 매도 트리거: 평단가 대비 수익률 (양수)
  buyTarget: number;     // 매수 트리거: 당일 하락률 임계값 (음수, 이 이하로 하락 시 매수)
  holdingDays: number;   // 최대 보유 거래일
  profitReinvest: number;  // 이익 복리
  lossReinvest: number;    // 손실 복리
}

// [2026-04-04 최적화 v3.1] 전체 구간(2010~현재) 최적화 결과
// safe -3%/+2%/20d | aggr -5%/+8%/7d | bull -3%/+12%/45d
const MODE_CONFIGS: Record<'safe' | 'aggressive' | 'bull', ModeConfig> = {
  safe: {
    sellTarget: 0.02,     // 평단가 +2% 수익에서 매도
    buyTarget: -0.03,     // 전일 대비 -3% 이상 하락 시 매수
    holdingDays: 20,      // 최대 20 거래일 보유
    profitReinvest: 0.8,  // 이익복리 80%
    lossReinvest: 0.3     // 손실복리 30%
  },
  aggressive: {
    sellTarget: 0.08,     // 평단가 +8% 수익에서 매도
    buyTarget: -0.05,     // 전일 대비 -5% 이상 하락 시 매수
    holdingDays: 7,       // 최대 7 거래일 보유
    profitReinvest: 0.8,  // 이익복리 80%
    lossReinvest: 0.3     // 손실복리 30%
  },
  bull: {
    sellTarget: 0.12,     // 평단가 +12% 수익에서 매도
    buyTarget: -0.03,     // 전일 대비 -3% 이상 하락 시 매수
    holdingDays: 45,      // 최대 45 거래일 보유
    profitReinvest: 0.8,  // 이익복리 80%
    lossReinvest: 0.3     // 손실복리 30%
  }
};

export const getModeConfig = (mode: 'safe' | 'aggressive' | 'bull'): ModeConfig => {
  return MODE_CONFIGS[mode];
};

/**
 * 거래일(영업일) 계산 - 주말 제외, O(1)
 * UTC 날짜 기준으로 DST 영향 없음
 */
export const calculateTradingDays = (startDate: string, endDate: string): number => {
  const startParts = startDate.split('-').map(Number);
  const endParts = endDate.split('-').map(Number);
  const startUTC = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
  const endUTC = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]);

  if (startUTC > endUTC) return 0;

  const totalDays = Math.floor((endUTC - startUTC) / 86400000) + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  let tradingDays = fullWeeks * 5;

  // 나머지 날짜에서 주말 제거
  const startDow = new Date(startUTC).getUTCDay(); // 0=일, 6=토
  const remainder = totalDays % 7;
  for (let i = 0; i < remainder; i++) {
    const dow = (startDow + i) % 7;
    if (dow !== 0 && dow !== 6) tradingDays++;
  }

  return tradingDays;
};

/**
 * 수수료 계산
 */
export const calculateCommission = (amount: number): number => {
  return amount * getTotalFeeRate();
};
