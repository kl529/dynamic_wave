/**
 * 추세 필터: 기초지수 종가가 n일 단순이동평균 위에 있으면 보유, 아래면 현금.
 * 신호[t]는 t일 종가까지의 정보로 계산되므로 체결은 다음 거래일(t+1) 종가에 한다.
 */

/** 단순이동평균. 앞 n-1개는 NaN */
export function sma(values: number[], n: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** 종가 > SMA(n) 이면 true. SMA가 아직 없으면 false (현금) */
export function trendSignals(closes: number[], n: number): boolean[] {
  const avg = sma(closes, n);
  return closes.map((c, i) => !Number.isNaN(avg[i]) && c > avg[i]);
}

/** 추세 앙상블: 여러 기간의 SMA 중 종가가 위에 있는 비율 (0~1) */
export function trendEnsemble(closes: number[], periods: number[]): number[] {
  const sigs = periods.map(n => trendSignals(closes, n));
  return closes.map((_, i) => sigs.filter(s => s[i]).length / periods.length);
}

/**
 * 변동성 필터 비율: min(1, n일 실현변동성(연율)의 과거 중앙값 ÷ 현재 n일 변동성).
 * 중앙값은 그날까지의 값으로만 구한다(데이터 처음부터 누적). 값이 250개 쌓이기 전에는 1.
 * 시장이 평소보다 크게 흔들릴수록 비중을 줄인다 — 레버리지 ETF는 그때 일일 리밸런싱 손실이 커진다.
 */
export function volScale(closes: number[], n = 20): number[] {
  const vol = realizedVol(closes, n);
  const sorted: number[] = [];
  return vol.map(v => {
    if (!Number.isNaN(v)) {
      let lo = 0, hi = sorted.length; // 정렬 유지 삽입
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= v) lo = mid + 1; else hi = mid; }
      sorted.splice(lo, 0, v);
    }
    const med = sorted.length > 250 ? sorted[Math.floor(sorted.length / 2)] : NaN;
    return Number.isNaN(med) || !(v > 0) ? 1 : Math.min(1, med / v); // 변동성 0(실데이터에는 없음)은 축소하지 않는다
  });
}

/** n일 실현변동성 (로그수익률 표준편차 × √252). 앞 n개는 NaN */
export function realizedVol(closes: number[], n = 20): number[] {
  const r = closes.map((c, i) => (i ? Math.log(c / closes[i - 1]) : 0));
  return r.map((_, i) => {
    if (i < n) return NaN;
    const w = r.slice(i - n + 1, i + 1), m = w.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) * Math.sqrt(252);
  });
}

/** 추세 앙상블 × 변동성 필터, 20%p 단위로 반올림한 목표 비중 */
export function filteredEnsemble(closes: number[], periods: number[], volWindow = 20, step = 5): number[] {
  const ens = trendEnsemble(closes, periods), scale = volScale(closes, volWindow);
  return ens.map((e, i) => Math.round(e * scale[i] * step) / step);
}
