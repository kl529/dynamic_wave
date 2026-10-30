/**
 * RSI (Relative Strength Index) 계산 유틸리티
 * - 일간 RSI 계산 (14일 기준)
 * - 주간 RSI 계산 (매주 금요일 종가 기준, 14주 기간)
 * - 지지난주 vs 지난주 RSI 비교로 매매 모드 자동 결정
 */

import { MarketData } from '@/types';
import { nextTradingDay } from '@/lib/marketTime';

export interface RSIData {
  date: string;
  price: number;
  rsi: number | null;
  prevRSI?: number | null;
  mode: 'safe' | 'aggressive';
  modeReason: string;
  signalStrength: {
    strength: number;
    label: string;
    color: string;
  };
}

export interface WeeklyRSIData {
  date: string;
  price: number;
  rsi: number | null;
  prevRSI: number | null;
}

export interface WeeklyModeInfo {
  mode: 'safe' | 'aggressive' | 'bull' | 'cash';
  reason: string;
  lastWeekRSI: number | null;
  twoWeeksAgoRSI: number | null;
  lastWeekDate: string | null;
  twoWeeksAgoDate: string | null;
}

/**
 * RSI 계산 함수 (14일 기준)
 * @param priceData - 가격 데이터 배열 [{date, price, ...}, ...]
 * @param period - RSI 기간 (기본값: 14)
 * @returns RSI 값이 추가된 데이터 배열
 */
export function calculateRSI(
  priceData: MarketData[],
  period: number = 14
): (MarketData & { rsi: number | null })[] {
  if (!priceData || priceData.length < period + 1) {
    return priceData.map(d => ({ ...d, rsi: 50 as number | null }));
  }

  const result: (MarketData & { rsi: number | null })[] = priceData.map(d => ({ ...d, rsi: null }));

  // 첫 period일: SMA로 avgGain/avgLoss 초기화 (Wilder's RSI 표준)
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = priceData[i].price - priceData[i - 1].price;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  result[period].rsi = avgLoss === 0
    ? 100
    : Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100;

  // period+1 이후: Wilder's 지수평활 (SMMA)
  // avgGain = (prevAvgGain × (period-1) + todayGain) / period
  for (let i = period + 1; i < priceData.length; i++) {
    const change = priceData[i].price - priceData[i - 1].price;
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;

    result[i].rsi = avgLoss === 0
      ? 100
      : Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100;
  }

  return result;
}

/**
 * RSI 기반 매매 모드 자동 결정
 * @param currentRSI - 현재 RSI 값
 * @param prevRSI - 전일 RSI 값
 * @returns 'safe' | 'aggressive'
 */
export function determineTradingMode(
  currentRSI: number | null,
  prevRSI: number | null
): 'safe' | 'aggressive' {
  if (!currentRSI || !prevRSI) {
    return 'safe'; // 기본값
  }

  const isRising = currentRSI > prevRSI;
  const isFalling = currentRSI < prevRSI;

  // 안전모드 조건 체크
  // 1. RSI > 65 영역에서 하락
  if (currentRSI > 65 && isFalling) {
    return 'safe';
  }

  // 2. 40 < RSI < 50 영역에서 하락
  if (currentRSI > 40 && currentRSI < 50 && isFalling) {
    return 'safe';
  }

  // 3. RSI가 50 밑으로 하락 (전일 50 이상 → 오늘 50 미만)
  if (prevRSI >= 50 && currentRSI < 50) {
    return 'safe';
  }

  // 공세모드 조건 체크
  // 1. RSI가 50 위로 상승 (전일 50 미만 → 오늘 50 이상)
  if (prevRSI < 50 && currentRSI >= 50) {
    return 'aggressive';
  }

  // 2. RSI < 35 영역에서 상승
  if (currentRSI < 35 && isRising) {
    return 'aggressive';
  }

  // 3. 30 < RSI < 60 영역에서 상승
  if (currentRSI > 30 && currentRSI < 60 && isRising) {
    return 'aggressive';
  }

  // 기본값: 안전모드
  return 'safe';
}

/**
 * RSI 모드 결정에 대한 설명 텍스트 반환
 * @param mode - 'safe' | 'aggressive'
 * @param currentRSI - 현재 RSI
 * @param prevRSI - 전일 RSI
 * @returns 모드 결정 이유
 */
export function getModeReason(
  mode: 'safe' | 'aggressive',
  currentRSI: number | null,
  prevRSI: number | null
): string {
  if (!currentRSI || !prevRSI) {
    return '데이터 부족으로 안전모드 설정';
  }

  const isRising = currentRSI > prevRSI;
  const isFalling = currentRSI < prevRSI;
  const rsiChange = (currentRSI - prevRSI).toFixed(2);

  if (mode === 'safe') {
    if (currentRSI > 65 && isFalling) {
      return `RSI ${currentRSI.toFixed(1)} (과매수 구간에서 하락 ${rsiChange})`;
    }
    if (currentRSI > 40 && currentRSI < 50 && isFalling) {
      return `RSI ${currentRSI.toFixed(1)} (중립 하단에서 하락 ${rsiChange})`;
    }
    if (prevRSI >= 50 && currentRSI < 50) {
      return `RSI ${currentRSI.toFixed(1)} (50선 하향 돌파 ${rsiChange})`;
    }
    return `RSI ${currentRSI.toFixed(1)} (기본 안전모드)`;
  }

  // aggressive
  if (prevRSI < 50 && currentRSI >= 50) {
    return `RSI ${currentRSI.toFixed(1)} (50선 상향 돌파 +${rsiChange})`;
  }
  if (currentRSI < 35 && isRising) {
    return `RSI ${currentRSI.toFixed(1)} (과매도 구간에서 상승 +${rsiChange})`;
  }
  if (currentRSI > 30 && currentRSI < 60 && isRising) {
    return `RSI ${currentRSI.toFixed(1)} (중립 구간 상승 +${rsiChange})`;
  }

  return `RSI ${currentRSI.toFixed(1)} (공세모드)`;
}

/**
 * RSI 시그널 강도 계산 (0-100)
 * @param rsi - 현재 RSI 값
 * @returns { strength: number, label: string, color: string }
 */
export function getRSISignalStrength(rsi: number | null): {
  strength: number;
  label: string;
  color: string;
} {
  if (!rsi) {
    return { strength: 50, label: '중립', color: '#888' };
  }

  if (rsi >= 70) {
    return { strength: 90, label: '강한 과매수', color: '#cf1322' };
  } else if (rsi >= 65) {
    return { strength: 75, label: '과매수', color: '#ff7875' };
  } else if (rsi >= 55) {
    return { strength: 60, label: '약한 과매수', color: '#ffa940' };
  } else if (rsi >= 45) {
    return { strength: 50, label: '중립', color: '#1890ff' };
  } else if (rsi >= 35) {
    return { strength: 40, label: '약한 과매도', color: '#52c41a' };
  } else if (rsi >= 30) {
    return { strength: 25, label: '과매도', color: '#73d13d' };
  } else {
    return { strength: 10, label: '강한 과매도', color: '#95de64' };
  }
}

/**
 * 전체 프로세스: 가격 데이터 → RSI 계산 → 모드 결정
 * @param priceData - 가격 데이터 배열
 * @returns RSI와 자동 모드가 추가된 데이터 배열
 */
export function enrichDataWithRSI(priceData: MarketData[]): RSIData[] {
  // 1. RSI 계산
  const dataWithRSI = calculateRSI(priceData);

  // 2. 각 날짜별 모드 결정
  return dataWithRSI.map((day, index) => {
    if (index === 0 || !day.rsi) {
      return {
        date: day.date,
        price: day.price,
        rsi: day.rsi,
        prevRSI: null,
        mode: 'safe' as const,
        modeReason: '초기 데이터 - 안전모드',
        signalStrength: getRSISignalStrength(day.rsi)
      };
    }

    const prevRSI = dataWithRSI[index - 1].rsi;
    const mode = determineTradingMode(day.rsi, prevRSI);
    const modeReason = getModeReason(mode, day.rsi, prevRSI);
    const signalStrength = getRSISignalStrength(day.rsi);

    return {
      date: day.date,
      price: day.price,
      rsi: day.rsi,
      prevRSI,
      mode,
      modeReason,
      signalStrength
    };
  });
}

/**
 * 최신 RSI 기반 모드 가져오기
 * @param priceData - 가격 데이터 배열
 * @returns { mode, reason, rsi, prevRSI }
 */
export function getLatestRSIMode(priceData: MarketData[]): {
  mode: 'safe' | 'aggressive';
  reason: string;
  rsi: number | null;
  prevRSI: number | null;
} {
  const enrichedData = enrichDataWithRSI(priceData);
  const latest = enrichedData[enrichedData.length - 1];

  if (!latest) {
    return {
      mode: 'safe',
      reason: '데이터 없음',
      rsi: null,
      prevRSI: null
    };
  }

  return {
    mode: latest.mode,
    reason: latest.modeReason,
    rsi: latest.rsi,
    prevRSI: latest.prevRSI || null
  };
}

// ==================== 주간 RSI 계산 함수들 ====================

/**
 * 주간 데이터 추출: 각 ISO 주의 마지막 거래일 종가 (보통 금요일)
 * 마지막 주는 진행 중일 수 있다 — 완료 여부는 호출하는 쪽이 판단한다.
 */
export function getWeeklyData(priceData: MarketData[]): MarketData[] {
  const weeklyData: MarketData[] = [];
  let lastKey = '';
  for (const data of priceData) {
    const key = isoWeekKey(data.date);
    if (key === lastKey) weeklyData[weeklyData.length - 1] = data;
    else weeklyData.push(data);
    lastKey = key;
  }
  return weeklyData;
}

/**
 * ISO 주차 키 ('YYYY-Www'). 날짜 문자열을 UTC로 해석해 시간대와 무관하고,
 * 연말(12/29~31이 다음 해 1주차) 경계에서도 주-연도를 올바르게 쓴다.
 */
export function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // 해당 주 목요일
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** 마지막 확정 봉 다음 정규장이 다른 주에 있으면 그 주는 끝났다 (금요일 휴장 주 포함) */
export function isWeekComplete(lastBarDate: string): boolean {
  return isoWeekKey(nextTradingDay(lastBarDate)) !== isoWeekKey(lastBarDate);
}

/**
 * 주간 RSI 계산 (14주 기준)
 */
export function calculateWeeklyRSI(priceData: MarketData[], period: number = 14): WeeklyRSIData[] {
  // 1. 주간 데이터 추출
  const weeklyData = getWeeklyData(priceData);

  if (weeklyData.length < period + 1) {
    // 데이터 부족 시 기본값
    return weeklyData.map((data, i) => ({
      date: data.date,
      price: data.price,
      rsi: 50,
      prevRSI: i > 0 ? 50 : null
    }));
  }

  // 2. 주간 종가로 RSI 계산 (Wilder's Smoothed Moving Average)
  const prices = weeklyData.map(d => d.price);
  const rsiValues: (number | null)[] = new Array(prices.length).fill(null);

  // 첫 period주: SMA 초기화
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  rsiValues[period] = avgLoss === 0
    ? 100
    : Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100;

  // period+1 이후: Wilder's 지수평활
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;

    rsiValues[i] = avgLoss === 0
      ? 100
      : Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100;
  }

  // 3. 결과 반환
  return weeklyData.map((data, i) => ({
    date: data.date,
    price: data.price,
    rsi: rsiValues[i],
    prevRSI: i > 0 ? rsiValues[i - 1] : null
  }));
}

/**
 * 지난주 RSI와 지지난주 RSI 비교로 모드 결정
 *
 * 모드 우선순위:
 *   safe     - RSI 하락 중, 50선 하향돌파, RSI > 65 (과매수)
 *   bull     - RSI 55-65 구간에서 상승 중 (강세 추세: 매수 조건 완화 -2%)
 *   aggressive - 그 외 상승 구간 (일반 반등/상향돌파)
 */
export function determineWeeklyMode(
  lastWeekRSI: number | null,
  twoWeeksAgoRSI: number | null
): { mode: 'safe' | 'aggressive' | 'bull' | 'cash'; reason: string } {
  if (lastWeekRSI === null || twoWeeksAgoRSI === null) {
    return { mode: 'safe', reason: 'RSI 데이터 부족 - 안전모드' };
  }

  const isRising = lastWeekRSI > twoWeeksAgoRSI;
  const isFalling = lastWeekRSI < twoWeeksAgoRSI;
  const rsiChange = lastWeekRSI - twoWeeksAgoRSI;

  // 현금 보유 모드: RSI < 40 하락 중 → 하락장 진입, 신규 매수 중단 + 보유 포지션 청산
  if (isFalling && lastWeekRSI < 40) {
    return {
      mode: 'cash',
      reason: `RSI ${lastWeekRSI.toFixed(1)} (하락장 감지 — 현금 보유, 매수 중단)`
    };
  }

  // 안전모드 조건
  if (isFalling) {
    return {
      mode: 'safe',
      reason: `RSI 하락 중 (${twoWeeksAgoRSI.toFixed(1)} → ${lastWeekRSI.toFixed(1)}, ${rsiChange.toFixed(1)})`
    };
  }

  if (twoWeeksAgoRSI >= 50 && lastWeekRSI < 50) {
    return {
      mode: 'safe',
      reason: `RSI 50선 하향 돌파 (${twoWeeksAgoRSI.toFixed(1)} → ${lastWeekRSI.toFixed(1)})`
    };
  }

  if (lastWeekRSI > 65) {
    return {
      mode: 'safe',
      reason: `RSI 과매수 구간 (${lastWeekRSI.toFixed(1)})`
    };
  }

  // 강세모드 조건: RSI 55-65 구간에서 상승 중 → 매수 조건 완화 (-2%)
  if (lastWeekRSI >= 55 && lastWeekRSI <= 65 && isRising) {
    return {
      mode: 'bull',
      reason: `RSI 강세 구간 상승 중 (${twoWeeksAgoRSI.toFixed(1)} → ${lastWeekRSI.toFixed(1)}, +${rsiChange.toFixed(1)}) — 매수 -2% 완화`
    };
  }

  // 공세모드 조건
  if (isRising) {
    return {
      mode: 'aggressive',
      reason: `RSI 상승 중 (${twoWeeksAgoRSI.toFixed(1)} → ${lastWeekRSI.toFixed(1)}, +${rsiChange.toFixed(1)})`
    };
  }

  if (twoWeeksAgoRSI < 50 && lastWeekRSI >= 50) {
    return {
      mode: 'aggressive',
      reason: `RSI 50선 상향 돌파 (${twoWeeksAgoRSI.toFixed(1)} → ${lastWeekRSI.toFixed(1)})`
    };
  }

  if (lastWeekRSI < 35 && isRising) {
    return {
      mode: 'aggressive',
      reason: `RSI 과매도 반등 (${twoWeeksAgoRSI.toFixed(1)} → ${lastWeekRSI.toFixed(1)})`
    };
  }

  // 기본값
  return {
    mode: 'safe',
    reason: `기본 안전모드 (RSI: ${lastWeekRSI.toFixed(1)})`
  };
}

/**
 * 다음 정규장에 적용할 주간 RSI 모드.
 * 진행 중인 주는 제외하고 완료된 주만 쓴다 (백테스트의 enrichDataWithWeeklyRSIMode와 동일한 규칙).
 * priceData 는 확정 봉만 담아야 한다 (marketDataService가 장중 봉을 뺀다).
 */
export function getWeeklyRSIModeInfo(priceData: MarketData[]): WeeklyModeInfo {
  const allWeeks = calculateWeeklyRSI(priceData);
  const lastDate = priceData[priceData.length - 1]?.date;
  const weeklyRSI = lastDate && !isWeekComplete(lastDate)
    ? allWeeks.slice(0, -1)
    : allWeeks;

  if (weeklyRSI.length < 2) {
    return {
      mode: 'safe',
      reason: '주간 데이터 부족 - 안전모드',
      lastWeekRSI: null,
      twoWeeksAgoRSI: null,
      lastWeekDate: null,
      twoWeeksAgoDate: null
    };
  }

  const lastWeek = weeklyRSI[weeklyRSI.length - 1];
  const twoWeeksAgo = weeklyRSI[weeklyRSI.length - 2];

  const { mode, reason } = determineWeeklyMode(lastWeek.rsi, twoWeeksAgo.rsi);

  return {
    mode,
    reason,
    lastWeekRSI: lastWeek.rsi,
    twoWeeksAgoRSI: twoWeeksAgo.rsi,
    lastWeekDate: lastWeek.date,
    twoWeeksAgoDate: twoWeeksAgo.date
  };
}

/**
 * 일간 데이터에 그날 적용되는 주간 RSI 모드를 붙인다.
 * 주 W의 종가로 정한 모드는 다음 주 첫 거래일부터 적용한다 — 그 주 안에서는 아직 알 수 없는 값이기 때문.
 */
export function enrichDataWithWeeklyRSIMode(
  priceData: MarketData[]
): (MarketData & { mode: 'safe' | 'aggressive' | 'bull' | 'cash'; modeReason: string })[] {
  const modeAfterWeek = new Map<string, { mode: 'safe' | 'aggressive' | 'bull' | 'cash'; reason: string }>();
  for (const week of calculateWeeklyRSI(priceData)) {
    if (week.rsi !== null && week.prevRSI !== null) {
      modeAfterWeek.set(isoWeekKey(week.date), determineWeeklyMode(week.rsi, week.prevRSI));
    }
  }

  let current: { mode: 'safe' | 'aggressive' | 'bull' | 'cash'; reason: string } = { mode: 'safe', reason: '주간 데이터 부족 - 안전모드' };
  let prevKey = '';

  return priceData.map(data => {
    const key = isoWeekKey(data.date);
    if (prevKey && key !== prevKey) current = modeAfterWeek.get(prevKey) ?? current;
    prevKey = key;
    return { ...data, mode: current.mode, modeReason: current.reason };
  });
}
