/**
 * 백테스트 공용 계산: 목표 비중 시뮬레이션, 신호 지연, 세금, 성과 지표.
 * 앱의 백테스팅 화면과 검증 스크립트(scripts/research)가 같이 쓴다.
 */
import { isoWeekKey } from '@/utils/rsiCalculator';
import { getTotalFeeRate } from '@/utils/tradingConfig';
import { trendEnsemble, trendSignals } from '@/lib/trend';

export type Series = { date: string; price: number }[];
/** shares/equity는 수수료만 반영된 세전 값 */
export type Run = { dates: string[]; prices: number[]; shares: number[]; equity: number[] };

export const FEE = getTotalFeeRate();

export const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;

/** dates 각각에 대해 그 날짜 이하의 마지막 값 (없으면 첫 값) */
export function ffillOn(dates: string[], s: Series): number[] {
  const out: number[] = [];
  let j = 0;
  for (const d of dates) {
    while (j + 1 < s.length && s[j + 1].date <= d) j++;
    out.push(s[j].price);
  }
  return out;
}

// ── 시뮬레이션 ─────────────────────────────────────────────────

/**
 * 목표 보유비중(0~1)이 바뀐 날 종가에 비중을 맞춘다. exposure[t]는 t일 종가 '이전'에 결정돼 있어야 한다.
 * cashRatePct를 주면 현금이 그날의 단기금리(연 %)로 이자를 받는다 (예: 단기국채 ETF 보유).
 */
export function runExposure(s: Series, exposure: number[], fee = FEE, cashRatePct?: number[]): Run {
  let cash = 1, shares = 0;
  const run: Run = { dates: [], prices: [], shares: [], equity: [] };
  s.forEach((b, t) => {
    if (cashRatePct && t > 0 && cash > 0) cash *= 1 + cashRatePct[t] / 100 / 252;
    // 목표 비중이 바뀐 날에만 매매한다 (실전과 같게: 가격 변동으로 생긴 비중 차이는 맞추지 않음)
    if (t === 0 || exposure[t] !== exposure[t - 1]) {
      const eq = cash + shares * b.price;
      let target = (exposure[t] * eq) / b.price;
      if (target > shares) target = shares + (target - shares) / (1 + fee); // 매수 수수료만큼 덜 산다
      if (Math.abs(target - shares) > 1e-12) {
        cash = eq - target * b.price - Math.abs(target - shares) * b.price * fee;
        shares = target;
      }
    }
    run.dates.push(b.date); run.prices.push(b.price); run.shares.push(shares); run.equity.push(cash + shares * b.price);
  });
  return run;
}

/** 추세 필터 보유비중: signalSrc 종가 > SMA(n) 이면 다음 거래일 종가에 100% 보유 */
export function trendExposure(traded: Series, signalSrc: Series, n: number): number[] {
  const sig = trendSignals(signalSrc.map(b => b.price), n);
  return lagOnto(traded, signalSrc, sig.map(s => (s ? 1 : 0)));
}

/** 추세 앙상블 보유비중: 여러 SMA 중 위에 있는 비율만큼 다음 거래일 종가에 보유 */
export function ensembleExposure(traded: Series, signalSrc: Series, periods: number[]): number[] {
  return lagOnto(traded, signalSrc, trendEnsemble(signalSrc.map(b => b.price), periods));
}

/** 주 1회만 조정: 각 주 첫 거래일의 보유비중(= 지난주 마지막 종가 신호)을 그 주 내내 유지 */
export function weeklyOnly(traded: Series, exposure: number[]): number[] {
  let held = 0;
  return traded.map((b, t) => {
    if (t === 0 || isoWeekKey(b.date) !== isoWeekKey(traded[t - 1].date)) held = exposure[t];
    return held;
  });
}

/** 거래일 t에는 그날보다 앞선 신호원 마지막 날짜의 값을 쓴다 (t-1 종가 신호 → t 종가 체결) */
function lagOnto(traded: Series, signalSrc: Series, values: number[]): number[] {
  let j = -1;
  return traded.map(b => {
    while (j + 1 < signalSrc.length && signalSrc[j + 1].date < b.date) j++;
    return j >= 0 ? values[j] : 0;
  });
}

/** [from, to] 구간만 잘라 1로 정규화 (신호 계산용 워밍업 구간 제거) */
export function sliceRun(run: Run, from: string, to = '9999-12-31'): Run {
  const i = run.dates.findIndex(d => d >= from);
  let j = run.dates.length - 1;
  while (j > i && run.dates[j] > to) j--;
  const k = 1 / run.equity[i];
  return {
    dates: run.dates.slice(i, j + 1), prices: run.prices.slice(i, j + 1),
    shares: run.shares.slice(i, j + 1).map(x => x * k), equity: run.equity.slice(i, j + 1).map(x => x * k),
  };
}

/** 평가 시작일부터 잘라 1로 정규화 (신호 계산용 워밍업 구간 제거) */
export function trimRun(run: Run, from: string): Run {
  const i = run.dates.findIndex(d => d >= from);
  const k = 1 / run.equity[i];
  return {
    dates: run.dates.slice(i), prices: run.prices.slice(i),
    shares: run.shares.slice(i).map(x => x * k), equity: run.equity.slice(i).map(x => x * k),
  };
}

// ── 세금 ───────────────────────────────────────────────────────

/**
 * 해외주식 양도소득세: 연도별 실현이익 합계가 양수면 그 해 말에 taxRate 만큼 납부 (이월공제 없음).
 * 취득가는 이동평균법. 기본공제 250만원은 계좌 규모에 따라 달라 반영하지 않음 (보수적).
 * 전략은 규모 불변이므로 세금 납부를 이후 경로 전체의 비례 축소로 처리한다.
 * 마지막 날 전량 청산을 가정해 미실현이익에도 과세한 값을 finalAfterTax로 준다.
 */
export function applyTax(run: Run, taxRate: number) {
  let scale = 1, avgCost = 0, realized = 0, taxPaid = 0;
  const equity: number[] = [];
  for (let t = 0; t < run.dates.length; t++) {
    const prev = t > 0 ? run.shares[t - 1] : 0, cur = run.shares[t], p = run.prices[t];
    if (cur < prev) realized += (prev - cur) * (p - avgCost);
    else if (cur > prev) avgCost = (prev * avgCost + (cur - prev) * p) / cur;
    if (cur <= 1e-12) avgCost = 0;
    const yearEnd = t === run.dates.length - 1 || run.dates[t + 1].slice(0, 4) !== run.dates[t].slice(0, 4);
    if (yearEnd && t < run.dates.length - 1) {
      const tax = Math.max(0, realized) * taxRate;
      taxPaid += tax * scale;
      scale *= 1 - tax / run.equity[t];
      realized = 0;
    }
    equity.push(run.equity[t] * scale);
  }
  const last = run.dates.length - 1;
  const unrealized = run.shares[last] * (run.prices[last] - avgCost);
  const finalTax = Math.max(0, realized + unrealized) * taxRate * scale;
  return { equity, finalAfterTax: equity[last] - finalTax, taxPaid: taxPaid + finalTax };
}

// ── 지표 ───────────────────────────────────────────────────────

export type Stats = {
  cagr: number; total: number; mdd: number; vol: number; sharpe: number;
  worstYear: number; bestYear: number; yearly: Record<string, number>;
  roll5Min: number; roll5Median: number; roll5NegShare: number;
  timeInMarket: number; tradesPerYear: number;
};

export function stats(dates: string[], equity: number[], shares?: number[], finalValue?: number): Stats {
  const n = equity.length;
  const years = daysBetween(dates[0], dates[n - 1]) / 365.25;
  const end = finalValue ?? equity[n - 1];
  let peak = equity[0], mdd = 0, sum = 0, sum2 = 0;
  const yearly: Record<string, number> = {};
  let yStart = equity[0];
  for (let t = 0; t < n; t++) {
    peak = Math.max(peak, equity[t]);
    mdd = Math.min(mdd, equity[t] / peak - 1);
    if (t > 0) { const r = equity[t] / equity[t - 1] - 1; sum += r; sum2 += r * r; }
    const yearEnd = t === n - 1 || dates[t + 1].slice(0, 4) !== dates[t].slice(0, 4);
    if (yearEnd) { yearly[dates[t].slice(0, 4)] = equity[t] / yStart - 1; yStart = equity[t]; }
  }
  const mean = sum / (n - 1), sd = Math.sqrt(sum2 / (n - 1) - mean * mean);
  const W = 1260, rolls: number[] = [];
  for (let t = W; t < n; t += 5) rolls.push(Math.pow(equity[t] / equity[t - W], 1 / 5) - 1);
  rolls.sort((a, b) => a - b);
  const yv = Object.values(yearly);
  let trades = 0, inMarket = 0;
  if (shares) for (let t = 0; t < n; t++) {
    if (shares[t] > 1e-12) inMarket++;
    if (t > 0 && Math.abs(shares[t] - shares[t - 1]) > 1e-9 * Math.max(shares[t], shares[t - 1])) trades++;
  }
  return {
    cagr: Math.pow(end / equity[0], 1 / years) - 1, total: end / equity[0] - 1, mdd,
    vol: sd * Math.sqrt(252), sharpe: (mean / sd) * Math.sqrt(252),
    worstYear: Math.min(...yv), bestYear: Math.max(...yv), yearly,
    roll5Min: rolls[0] ?? NaN, roll5Median: rolls[Math.floor(rolls.length / 2)] ?? NaN,
    roll5NegShare: rolls.length ? rolls.filter(r => r < 0).length / rolls.length : NaN,
    timeInMarket: shares ? inMarket / n : NaN, tradesPerYear: shares ? trades / years : NaN,
  };
}

/** 구간 통계 (세후 곡선을 잘라서 계산) */
export function periodStats(dates: string[], equity: number[], from: string, to: string): Stats {
  const i = dates.findIndex(d => d >= from);
  let j = dates.length - 1;
  while (dates[j] > to) j--;
  return stats(dates.slice(i, j + 1), equity.slice(i, j + 1));
}
