/**
 * 동파법 SOXL 매매 시스템 상수 정의
 * 모든 하드코딩된 값들을 중앙 관리
 */

import { DongpaConfig } from '@/types';

// ===== 기본 설정 =====
// [2026-04-04 최적화 v3] 분할수 5→10, 재분할주기 20→10 (하락/폭락/보합장 특화 그리드서치 결과)
export const DEFAULT_CONFIG: DongpaConfig = {
  initialCapital: 10000,
  divisions: 10,
  mode: 'auto',
  rebalancePeriod: 10
};

// ===== 매매 조건 =====
export const TRADING = {
  // 최소 거래 가능 현금
  MIN_CASH_FOR_TRADE: 100,

  // 안전모드 설정
  // [2026-04-04 최적화 v3.1]
  SAFE: {
    BUY_TARGET: -0.03,      // 변동률 < -3% 이면 매수
    SELL_TARGET: 0.02,      // +2% 수익 시 매도
    HOLDING_DAYS: 20,       // 최대 20 거래일 보유
  },

  // 공세모드 설정
  // [2026-04-04 최적화 v3.1]
  AGGRESSIVE: {
    BUY_TARGET: -0.05,      // 변동률 < -5% 이면 매수
    SELL_TARGET: 0.08,      // +8% 수익 시 매도
    HOLDING_DAYS: 7,        // 최대 7 거래일 보유
  },

  // 강세모드 설정
  BULL: {
    BUY_TARGET: -0.03,      // 변동률 < -3% 이면 매수
    SELL_TARGET: 0.12,      // +12% 수익 시 매도
    HOLDING_DAYS: 45,       // 최대 45 거래일 보유
  },

  // 복리 설정
  PROFIT_REINVEST: 0.8,     // 이익 복리 80%
  LOSS_REINVEST: 0.3,       // 손실 복리 30%
} as const;

// ===== 수수료 =====
export const FEES = {
  COMMISSION: 0.00044,      // 0.044% 거래 수수료
  SEC_FEE: 0.0000278,       // 0.00278% SEC 수수료
} as const;

// 총 수수료율 (편도)
export const getTotalFeeRate = (): number => {
  return FEES.COMMISSION + FEES.SEC_FEE;
};

// ===== 시간 설정 =====
export const TIMING = {
  // 시장 체크 간격 (밀리초)
  MARKET_CHECK_INTERVAL_MS: 60000,      // 1분
  
  // 알림 자동 닫기 (밀리초)
  NOTIFICATION_AUTO_CLOSE_MS: 10000,    // 10초
  
  // 권한 요청 타임아웃 (밀리초)
  PERMISSION_TIMEOUT_MS: 5000,          // 5초
  
  // 기본 데이터 조회 기간 (일)
  DEFAULT_HISTORICAL_DAYS: 90,
  
  // 90일을 밀리초로
  DAYS_90_MS: 90 * 24 * 60 * 60 * 1000,
} as const;

// ===== 백테스트 설정 =====
export const BACKTEST = {
  // 버퍼 일수
  BUFFER_DAYS: 30,
  
  // 최소 데이터 일수
  MIN_DAYS: 365,
  
  // 기본 조회 기간 (일)
  DEFAULT_PERIOD_DAYS: 90,
} as const;

// ===== RSI 설정 =====
export const RSI = {
  // RSI 기간
  PERIOD: 14,
  
  // 과매도 기준
  OVERSOLD: 30,
  
  // 과매수 기준
  OVERBOUGHT: 70,
} as const;

// ===== UI 설정 =====
export const UI = {
  // 최소 높이
  MIN_HEIGHT: 400,
  
  // 색상
  COLORS: {
    PRIMARY_GRADIENT: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    BUY_SIGNAL_BG: 'linear-gradient(135deg, rgba(24, 144, 255, 0.3) 0%, rgba(24, 144, 255, 0.15) 100%)',
    BUY_SIGNAL_BORDER: 'rgba(24, 144, 255, 0.5)',
    SELL_SIGNAL_BG: 'linear-gradient(135deg, rgba(82, 196, 26, 0.3) 0%, rgba(82, 196, 26, 0.15) 100%)',
    SELL_SIGNAL_BORDER: 'rgba(82, 196, 26, 0.5)',
    BACKGROUND: '#f5f5f5',
    CARD_BG: 'rgba(255,255,255,0.08)',
    CARD_BORDER: '1px dashed rgba(255,255,255,0.3)',
  },
} as const;

// ===== 알림 설정 =====
export const NOTIFICATION = {
  // 아이콘 경로
  ICON_192: '/icon-192x192.png',
  ICON_72: '/icon-72x72.png',
} as const;

// ===== Supabase 설정 =====
export const SUPABASE = {
  // 기본 사용자 ID (멀티테넌시 미지원 시)
  DEFAULT_USER_ID: 'default_user',
  
  // 에러 코드
  ERROR_CODES: {
    NOT_FOUND: 'PGRST116',
  },
} as const;
