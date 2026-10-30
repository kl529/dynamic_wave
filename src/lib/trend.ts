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
