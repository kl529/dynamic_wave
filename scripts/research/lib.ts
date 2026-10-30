/**
 * 전략 검증용 공용 함수: 데이터 로드, 합성 레버리지 시계열, 시뮬레이션, 세금, 지표.
 * 전략 로직은 앱과 같은 코드(src/)를 import 해서 쓴다 — 백테스트와 실전이 갈라지지 않게.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DivisionEngine } from '../../src/services/divisionEngine';
import { enrichDataWithWeeklyRSIMode } from '../../src/utils/rsiCalculator';
import type { MarketData } from '../../src/types';
import { daysBetween, ffillOn, type Run, type Series } from '../../src/lib/backtest';

// 시뮬레이션·세금·지표는 앱과 공유한다
export * from '../../src/lib/backtest';
const CACHE = join(import.meta.dir, '.cache');

// ── 데이터 ─────────────────────────────────────────────────────

function nyNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
      .formatToParts(new Date()).map(p => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** 야후 일봉 (close = 분할 조정 종가, adj = 배당까지 조정). 장중 미완성 봉은 버린다. */
export async function loadDaily(symbol: string, field: 'close' | 'adj', refresh: boolean): Promise<Series> {
  const file = join(CACHE, `${symbol.replace('^', '_')}.json`);
  let bars: { date: string; close: number; adj: number }[];
  if (!refresh && existsSync(file)) {
    bars = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
    const r = (await res.json()).chart.result[0];
    const close: (number | null)[] = r.indicators.quote[0].close;
    const adj: (number | null)[] = r.indicators.adjclose?.[0]?.adjclose ?? close;
    const now = nyNow();
    bars = [];
    r.timestamp.forEach((t: number, i: number) => {
      const date = new Date(t * 1000).toISOString().slice(0, 10);
      const partial = date === now.date && now.hour < 17;
      if (close[i] != null && !partial) bars.push({ date, close: close[i]!, adj: adj[i] ?? close[i]! });
    });
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(bars));
  }
  return bars.map(b => ({ date: b.date, price: field === 'adj' ? b.adj : b.close }));
}

export const slice = (s: Series, from: string, to = '9999') => s.filter(b => b.date >= from && b.date <= to);

// ── 합성 레버리지 ETF ──────────────────────────────────────────

/**
 * 지수 일간 수익률 × L 로 일일 리밸런싱 레버리지 ETF를 합성.
 * 차입비용 (L-1)×단기금리(^IRX), 연 drag(보수·스왑 스프레드·배당 차이)를 매일 차감.
 */
export function synthLeveraged(index: Series, rf: Series, L: number, annualDrag: number): Series {
  const rates = ffillOn(index.map(b => b.date), rf);
  let p = 1;
  return index.map((b, i) => {
    if (i > 0) {
      const r = b.price / index[i - 1].price - 1;
      p *= 1 + L * r - ((L - 1) * rates[i] / 100 + annualDrag) / 252;
    }
    return { date: b.date, price: p };
  });
}

const cagrOf = (s: Series) =>
  Math.pow(s[s.length - 1].price / s[0].price, 365.25 / daysBetween(s[0].date, s[s.length - 1].date)) - 1;

/** 실제 ETF와 겹치는 구간에서 CAGR이 같아지는 연 drag를 이분 탐색 */
export function calibrateDrag(index: Series, rf: Series, L: number, real: Series): number {
  const idx = slice(index, real[0].date);
  const target = cagrOf(real);
  let lo = -0.1, hi = 0.2;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (cagrOf(synthLeveraged(idx, rf, L, mid)) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 합성 vs 실제: 일간 수익률 상관, 연환산 추적오차, 연도별 수익률 차이 */
export function trackingReport(synth: Series, real: Series) {
  const m = new Map(synth.map(b => [b.date, b.price]));
  const pairs: [number, number][] = [];
  const years = new Map<string, { s0: number; r0: number; s1: number; r1: number }>();
  for (let i = 1; i < real.length; i++) {
    const s0 = m.get(real[i - 1].date), s1 = m.get(real[i].date);
    if (s0 === undefined || s1 === undefined) continue;
    pairs.push([s1 / s0 - 1, real[i].price / real[i - 1].price - 1]);
    const y = real[i].date.slice(0, 4);
    const e = years.get(y) ?? { s0, r0: real[i - 1].price, s1, r1: real[i].price };
    e.s1 = s1; e.r1 = real[i].price;
    years.set(y, e);
  }
  const n = pairs.length;
  const mean = (k: 0 | 1) => pairs.reduce((a, p) => a + p[k], 0) / n;
  const [ma, mb] = [mean(0), mean(1)];
  let cov = 0, va = 0, vb = 0, te = 0;
  for (const [a, b] of pairs) { cov += (a - ma) * (b - mb); va += (a - ma) ** 2; vb += (b - mb) ** 2; te += (a - b) ** 2; }
  return {
    days: n,
    corr: cov / Math.sqrt(va * vb),
    trackingErrorAnnual: Math.sqrt(te / n) * Math.sqrt(252),
    yearly: [...years].map(([y, e]) => ({ year: y, synth: e.s1 / e.s0 - 1, real: e.r1 / e.r0 - 1 })),
  };
}

/** 실제 ETF 상장 전 구간을 합성 시계열로 채운다 (상장일 가격에 맞춰 스케일) */
export function splice(real: Series, synth: Series): Series {
  const anchor = synth.find(b => b.date === real[0].date);
  if (!anchor) throw new Error('splice: 상장일이 합성 시계열에 없음');
  const k = real[0].price / anchor.price;
  return [...synth.filter(b => b.date < real[0].date).map(b => ({ date: b.date, price: b.price * k })), ...real];
}

/**
 * 앱의 DivisionEngine 그대로 실행 (동파법 / 하이브리드). 모드는 앱과 같은 주간 RSI 함수로 계산.
 * fixed 를 주면 RSI 모드 없이 그 값(매수 기준·매도 목표·보유일)만으로 운용한다 (파라미터 조정 검증용).
 */
export function runDivision(s: Series, opts: {
  hybrid: boolean; noDongpaBuys?: boolean; divisions?: number; rebalancePeriod?: number;
  fixed?: { buyTarget: number; sellTarget: number; holdingDays: number };
}): Run {
  const capital = 1e8; // 정수 주식 반올림 영향 최소화
  const data: MarketData[] = s.map((b, i) => ({
    date: b.date, price: b.price, change: 0, changePercent: 0, volume: 0, high: b.price, low: b.price, open: b.price,
    ...(i > 0 && { change: b.price - s[i - 1].price, changePercent: (b.price / s[i - 1].price - 1) * 100 }),
  }));
  const modes = new Map(enrichDataWithWeeklyRSIMode(data).map(d => [d.date, d.mode]));
  const never = { buyTarget: -1 }; // 하락률 -100% 이하 → 매수 없음 (동파 구간은 현금 대기)
  const engine = new DivisionEngine(
    { initialCapital: capital, divisions: opts.divisions ?? 10, mode: opts.fixed ? 'safe' : 'auto', rebalancePeriod: opts.rebalancePeriod ?? 10, hybrid: opts.hybrid },
    opts.fixed ? { safe: opts.fixed } : opts.noDongpaBuys ? { safe: never, aggressive: never, bull: never } : undefined
  );
  const recs = engine.backtest(data, modes);
  return {
    dates: recs.map(r => r.date), prices: recs.map(r => r.closePrice),
    shares: recs.map(r => r.totalHoldings / capital), equity: recs.map(r => r.totalAssets / capital),
  };
}


/**
 * 검증에 쓰는 전체 데이터: 지수, 단기금리, 실제 ETF, 상장 전 구간을 합성으로 이어 붙인 ETF 시계열.
 * 지수는 가격지수. SOXL은 앱(동파법 신호·LOC 체결)과 같은 실제 종가, 나머지 ETF는 배당 포함 수정주가.
 */
export async function loadUniverse(refresh: boolean) {
  const load = (sym: string, f: 'close' | 'adj') => loadDaily(sym, f, refresh);
  const [sox, ndx, spx, irx] = await Promise.all([load('^SOX', 'close'), load('^NDX', 'close'), load('^GSPC', 'close'), load('^IRX', 'close')]);
  const etf = Object.fromEntries(await Promise.all(
    ['SOXX', 'USD', 'SOXL', 'QQQ', 'QLD', 'TQQQ', 'SPY', 'SSO', 'UPRO'].map(async s => [s, await load(s, s === 'SOXL' ? 'close' : 'adj')] as const)
  ));
  const lastDate = etf.SOXL[etf.SOXL.length - 1].date;

  // ── 2. 합성 시계열: 지수 × L배, 실제 ETF와 겹치는 구간에서 drag 보정 후 상장 전 구간을 이어 붙인다 ──
  const families = [
    { key: 'SOX', label: '반도체', index: sox, etfs: ['SOXX', 'USD', 'SOXL'] },
    { key: 'NDX', label: '나스닥100', index: ndx, etfs: ['QQQ', 'QLD', 'TQQQ'] },
    { key: 'SPX', label: 'S&P500', index: spx, etfs: ['SPY', 'SSO', 'UPRO'] },
  ];
  const tracking: { pair: string; drag: number; corr: number; te: number; days: number }[] = [];
  const spliced: Record<string, Series> = {};
  let soxlYearly: ReturnType<typeof trackingReport>['yearly'] = [];
  for (const f of families) f.etfs.forEach((sym, i) => {
    const L = i + 1;
    const drag = calibrateDrag(f.index, irx, L, etf[sym]);
    const synth = synthLeveraged(f.index, irx, L, drag);
    const tr = trackingReport(synth, etf[sym]);
    tracking.push({ pair: `${sym} (${f.key} ${L}배)`, drag, corr: tr.corr, te: tr.trackingErrorAnnual, days: tr.days });
    if (sym === 'SOXL') soxlYearly = tr.yearly;
    spliced[sym] = splice(etf[sym], synth);
  });
  return { sox, ndx, spx, irx, etf, lastDate, families, tracking, soxlYearly, spliced };
}
