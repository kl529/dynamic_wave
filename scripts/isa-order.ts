/**
 * ISA 주문 계산기 (단일 파일, 외부 의존성 없음 — 다른 프로젝트에 그대로 복사해 쓸 수 있다).
 * 추천 전략(나스닥100 추세 앙상블 × 변동성 필터)의 목표 비중을 KODEX 미국나스닥100레버리지(합성 H) 409820 주문 수량으로 바꾼다.
 *
 *   bun scripts/isa-order.ts --shares 0 --cash 10000000
 *
 * 계산은 dongpa 앱(src/lib/strategy.ts, src/lib/trend.ts)과 같다. 일치 여부는 src/__tests__/lib/isaOrder.test.ts 가 확인한다.
 * - 신호: ^NDX 확정 종가 전체 기록(1985~, 야후). 변동성 중앙값을 처음부터 누적하므로 전체 기록이 필요하다.
 * - 가격: 네이버 실시간 현재가는 수량 계산에만 쓴다. 체결은 15:30 종가 단일가로 정해진다.
 * - 주문: 15:20~15:30에 보통가(지정가). 매수는 현재가 +1%, 매도는 -1%로 넣으면 종가가 그 안이면 종가로 체결된다.
 *   시장가 매수는 증권사가 주문 가능 수량을 상한가 기준으로 잡을 수 있어 예수금이 부족하다고 거절될 수 있다.
 * - 목표 비중이 전날과 같으면 주문하지 않는다. 단, 실제 비중이 목표와 10%p 이상 벌어져 있으면(첫 매수, 입출금) 맞춘다.
 */

export const PERIODS = [100, 150, 200, 250, 300];
export const VOL_WINDOW = 20;
const STEP = 5;          // 20%p 단위
const FEE = 0.0001;      // 매수 수량을 수수료만큼 낮춰 잡는 여유 (국내 ETF 수수료 약 0.0043%)
const BAND = 0.01;       // 지정가 여유: 매수 +1%, 매도 -1%

export type Bar = { date: string; price: number };

function sma(v: number[], n: number): number[] {
  const out = new Array<number>(v.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i];
    if (i >= n) sum -= v[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function realizedVol(c: number[], n: number): number[] {
  const r = c.map((x, i) => (i ? Math.log(x / c[i - 1]) : 0));
  return r.map((_, i) => {
    if (i < n) return NaN;
    const w = r.slice(i - n + 1, i + 1), m = w.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) * Math.sqrt(252);
  });
}

/** 날짜별 목표 비중 (0~1, 20%p 단위): 종가가 이동평균 위에 있는 비율 × min(1, 변동성 과거 중앙값 ÷ 현재 변동성) */
export function targetWeights(closes: number[]): number[] {
  const avgs = PERIODS.map(n => sma(closes, n));
  const vol = realizedVol(closes, VOL_WINDOW);
  const sorted: number[] = [];
  return closes.map((c, i) => {
    const trend = avgs.filter(a => !Number.isNaN(a[i]) && c > a[i]).length / PERIODS.length;
    const v = vol[i];
    if (!Number.isNaN(v)) {
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= v) lo = mid + 1; else hi = mid; }
      sorted.splice(lo, 0, v);
    }
    const med = sorted.length > 250 ? sorted[Math.floor(sorted.length / 2)] : NaN;
    const scale = Number.isNaN(med) || !(v > 0) ? 1 : Math.min(1, med / v);
    return Math.round(trend * scale * STEP) / STEP;
  });
}

/** 지정가: 매수는 현재가 +1% 올림, 매도는 -1% 내림 (호가 단위 2,000원 미만 1원, 이상 5원) */
export function limitPrice(price: number, side: 1 | -1): number {
  const tick = price < 2000 ? 1 : 5;
  return side > 0 ? Math.ceil((price * (1 + BAND)) / tick) * tick : Math.floor((price * (1 - BAND)) / tick) * tick;
}

/**
 * 주문 수량 (+매수 / -매도).
 *   평가금액 = 보유 × 현재가 + 예수금,  목표 수량 = 내림(목표 비중 × 평가금액 ÷ 현재가)
 *   매도 = 보유 − 목표 수량,  매수 = min(목표 수량 − 보유, 내림(예수금 ÷ 매수 지정가))
 */
export function orderShares(target: number, previous: number, price: number, shares: number, cash: number): number {
  const equity = shares * price + cash;
  if (equity <= 0) return 0;
  if (target === previous && Math.abs((shares * price) / equity - target) < 0.1) return 0;
  const diff = Math.floor((target * equity) / price) - shares;
  return diff > 0 ? Math.min(diff, Math.floor(cash / (limitPrice(price, 1) * (1 + FEE)))) : diff;
}

/** ^NDX 확정 일봉 전체 (정규장이 끝나지 않은 오늘 봉은 버린다) */
export async function fetchNdx(): Promise<Bar[]> {
  const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5ENDX?range=12000d&interval=1d', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`^NDX 조회 실패: HTTP ${res.status}`);
  const r = (await res.json()).chart.result[0];
  const close: (number | null)[] = r.indicators.quote[0].close;
  const session = r.meta?.currentTradingPeriod?.regular, now = Date.now() / 1000;
  return (r.timestamp as number[]).flatMap((t, i) => {
    const p = close[i];
    if (p == null || (session && t >= session.start && now < session.end)) return [];
    return [{ date: new Date(t * 1000).toISOString().slice(0, 10), price: p }];
  });
}

/** 네이버 실시간 현재가 (장 마감 후에는 종가) */
export async function fetchPrice(code = '409820'): Promise<number> {
  const res = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`);
  if (!res.ok) throw new Error(`${code} 시세 조회 실패: HTTP ${res.status}`);
  return Number((await res.json()).datas[0].closePrice.replace(/,/g, ''));
}

export async function isaOrder(holding: { shares: number; cash: number }, code = '409820') {
  const [ndx, price] = await Promise.all([fetchNdx(), fetchPrice(code)]);
  if (ndx.length < Math.max(...PERIODS) + 2) throw new Error('^NDX 데이터 부족');
  const w = targetWeights(ndx.map(b => b.price));
  const target = w[w.length - 1], previous = w[w.length - 2];
  const order = orderShares(target, previous, price, holding.shares, holding.cash);
  const limit = order ? limitPrice(price, order > 0 ? 1 : -1) : null;
  return { asOf: ndx[ndx.length - 1].date, target, previous, code, price, ...holding, order, limit, amount: Math.abs(order) * price };
}

if (process.argv[1]?.endsWith('isa-order.ts')) {
  const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : 0; };
  isaOrder({ shares: arg('shares'), cash: arg('cash') }).then(o => {
    const equity = o.shares * o.price + o.cash;
    console.log(`신호: ^NDX ${o.asOf} 종가 기준 목표 ${o.target * 100}% (전날 ${o.previous * 100}%)`);
    console.log(`409820 ${o.price.toLocaleString()}원 · 보유 ${o.shares}주 + 예수금 ${o.cash.toLocaleString()}원 = ${equity.toLocaleString()}원 (현재 비중 ${equity ? Math.round((o.shares * o.price / equity) * 100) : 0}%)`);
    console.log(o.order === 0 ? '→ 주문 없음' : `→ 409820 ${Math.abs(o.order)}주 ${o.order > 0 ? '매수' : '매도'} (약 ${Math.round(o.amount).toLocaleString()}원) · 15:20~15:30 보통가 ${o.limit!.toLocaleString()}원 (체결은 15:30 종가)`);
  }).catch(e => { console.error(e.message); process.exit(1); });
}
