/**
 * 개선 후보 검증 (2026-10-30, 3차 탐색) → docs/validation/improvements.{md,json}
 *   bun scripts/research/improve.ts
 *
 * 후보 (결과를 보기 전에 정함):
 *   ① 현금 구간에 단기국채 ETF(SGOV) 보유
 *   ② 변동성 필터: 목표 비중 × min(1, ^NDX 20일 변동성의 과거 중앙값 / 현재 20일 변동성), 20%p 단위로 반올림, 하루 늦춰 적용
 * 질문을 받고 추가: 같은 규칙을 TQQQ(3배)에 적용.
 * 비용: 매매 수수료(편도 0.047 / 0.09 / 0.25%), SGOV를 쓰면 반대쪽도 사고판다(수수료 2배), 국채 이자 배당소득세 15.4%, 양도세 22%.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Run, Series, Stats, applyTax, ensembleExposure, ffillOn, filteredExposure, loadUniverse, periodStats, stats, trendExposure, trimRun } from './lib';
import { STRATEGY } from '../../src/lib/strategy';

const OUT = join(import.meta.dir, '../../docs/validation');
const FEES = [0.00047, 0.0009, 0.0025];
const MAIN_FEE = 0.0009; // 나무증권 Open API 해외주식 수수료 (보도 기준)
const pct = (x: number, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '-');
const md = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');

/** 목표 비중이 바뀐 날만 매매. sgov=true 면 현금이 단기국채 이자(세후)를 받고, 매매 때 국채 쪽도 같이 사고판다 */
function sim(s: Series, exp: number[], fee: number, sgov: boolean, rates: number[]): Run {
  let cash = 1, shares = 0;
  const run: Run = { dates: [], prices: [], shares: [], equity: [] };
  s.forEach((b, t) => {
    if (sgov && t > 0 && cash > 0) cash *= 1 + (rates[t] / 100 / 252) * (1 - 0.154);
    if (t === 0 || exp[t] !== exp[t - 1]) {
      const eq = cash + shares * b.price, legs = sgov ? 2 : 1;
      let target = (exp[t] * eq) / b.price;
      if (target > shares) target = shares + (target - shares) / (1 + fee * legs);
      const notional = Math.abs(target - shares) * b.price;
      if (notional > 1e-12) { cash = eq - target * b.price - notional * fee * legs; shares = target; }
    }
    run.dates.push(b.date); run.prices.push(b.price); run.shares.push(shares); run.equity.push(cash + shares * b.price);
  });
  return run;
}

type Eval = { full: Stats; oos: Stats; real: Stats; pre95?: Stats; dates: string[]; equity: number[] };
function evaluate(raw: Run, from = '1995-03-01'): Eval {
  const run = trimRun(raw, from), tax = applyTax(run, 0.22);
  return {
    full: stats(run.dates, tax.equity, run.shares, tax.finalAfterTax),
    oos: periodStats(run.dates, tax.equity, from, '2010-03-10'),
    real: periodStats(run.dates, tax.equity, '2010-03-11', '9999'),
    pre95: from < '1995' ? periodStats(run.dates, tax.equity, from, '1995-02-28') : undefined,
    dates: run.dates, equity: tax.equity,
  };
}

/** 고점 대비 -threshold 이상 빠진 구간들: 고점일, 저점일·깊이, 회복일 */
function drawdowns(dates: string[], eq: number[], threshold: number) {
  const out: { peak: string; trough: string; depth: number; recovered: string | null; months: number }[] = [];
  let peakI = 0, troughI = 0, inDD = false;
  for (let t = 1; t <= eq.length; t++) {
    const v = eq[t];
    if (t === eq.length || v >= eq[peakI]) {
      if (inDD) {
        const recovered = t < eq.length ? dates[t] : null;
        const end = Date.parse(recovered ?? dates[eq.length - 1]);
        out.push({ peak: dates[peakI], trough: dates[troughI], depth: eq[troughI] / eq[peakI] - 1, recovered, months: Math.round((end - Date.parse(dates[peakI])) / 2.63e9) });
      }
      inDD = false; peakI = t; troughI = t;
    } else {
      if (v < eq[troughI]) troughI = t;
      if (eq[troughI] / eq[peakI] - 1 <= -threshold) inDD = true;
    }
  }
  return out;
}

const fi0 = () => FEES.indexOf(MAIN_FEE);

async function main() {
  const u = await loadUniverse(false);
  const ndx = u.ndx;
  const P = [...STRATEGY.periods];
  const always = (s: Series) => s.map(() => 1);

  const build = (sym: string, opts: { filter: boolean; win?: number; periods?: number[]; step?: number }) => {
    const s = u.spliced[sym];
    const periods = opts.periods ?? P;
    if (opts.filter) return filteredExposure(s, ndx, periods, opts.win ?? 20, opts.step ?? 5); // 앱과 같은 함수
    return periods.length === 1 ? trendExposure(s, ndx, periods[0]) : ensembleExposure(s, ndx, periods);
  };
  const ratesOf = (sym: string) => ffillOn(u.spliced[sym].map(b => b.date), u.irx);

  // ── 1. 비용 수준별 주요 비교 ──
  const variants: [string, string, boolean, boolean][] = [
    ['QLD 기본', 'QLD', false, false], ['QLD + 변동성 필터', 'QLD', true, false], ['QLD + 변동성 필터 + SGOV', 'QLD', true, true],
    ['TQQQ 기본', 'TQQQ', false, false], ['TQQQ + 변동성 필터', 'TQQQ', true, false], ['TQQQ + 변동성 필터 + SGOV', 'TQQQ', true, true],
  ];
  const main = variants.map(([name, sym, filter, sgov]) => {
    const exp = build(sym, { filter });
    const byFee = FEES.map(fee => evaluate(sim(u.spliced[sym], exp, fee, sgov, ratesOf(sym))));
    return { name, sym, filter, sgov, byFee };
  });
  const bench = {
    spy: evaluate(sim(u.spliced.SPY, always(u.spliced.SPY), MAIN_FEE, false, ratesOf('SPY'))),
    qqq: evaluate(sim(u.spliced.QQQ, always(u.spliced.QQQ), MAIN_FEE, false, ratesOf('QQQ'))),
    soxx: evaluate(sim(u.spliced.SOXX, always(u.spliced.SOXX), MAIN_FEE, false, ratesOf('SOXX'))),
  };

  // ── 2. 채택 기준 (수수료 0.09%) ──
  const at = (name: string) => main.find(m => m.name === name)!.byFee[FEES.indexOf(MAIN_FEE)];
  const crit = (e: Eval) => ({ c1: e.full.mdd > -0.8, c2: e.full.cagr > bench.soxx.full.cagr, c3: e.oos.mdd > -0.8 && e.oos.cagr > bench.soxx.oos.cagr });

  // ── 3. 견고성 (수수료 0.09%, 현금 0%) ──
  const robust: { cand: string; name: string; e: Eval }[] = [];
  for (const sym of ['QLD', 'TQQQ']) {
    const s = u.spliced[sym], rates = ratesOf(sym);
    const add = (name: string, exp: number[]) => robust.push({ cand: `${sym} + 변동성 필터`, name, e: evaluate(sim(s, exp, MAIN_FEE, false, rates)) });
    for (const win of [10, 20, 40, 60, 120]) add(`변동성 ${win}일`, build(sym, { filter: true, win }));
    add('이동평균 50~250', build(sym, { filter: true, periods: [50, 100, 150, 200, 250] }));
    add('이동평균 150~350', build(sym, { filter: true, periods: [150, 200, 250, 300, 350] }));
    add('이동평균 200일 하나', build(sym, { filter: true, periods: [200] }));
    add('10%p 단위', build(sym, { filter: true, step: 10 }));
  }
  const c4 = (cand: string) => robust.filter(r => r.cand === cand).every(r => r.e.full.cagr > bench.soxx.full.cagr && r.e.full.mdd > -0.8);

  // ── 4. 장기 구간 (1986-08 ~): 블랙먼데이 포함, 또 하나의 표본 외 ──
  const long = ['QLD 기본', 'QLD + 변동성 필터', 'TQQQ 기본', 'TQQQ + 변동성 필터'].map(name => {
    const v = variants.find(x => x[0] === name)!;
    return { name, e: evaluate(sim(u.spliced[v[1]], build(v[1], { filter: v[2] }), MAIN_FEE, false, ratesOf(v[1])), '1986-08-01') };
  });
  const longSpy = evaluate(sim(u.spliced.SPY, always(u.spliced.SPY), MAIN_FEE, false, ratesOf('SPY')), '1986-08-01');
  const longQqq = evaluate(sim(u.spliced.QQQ, always(u.spliced.QQQ), MAIN_FEE, false, ratesOf('QQQ')), '1986-08-01');

  // ── 5. 낙폭이 얼마나 자주 오나 (1986-08 ~, 세후 곡선) ──
  const ddTargets: [string, Eval][] = [
    ...long.map(l => [l.name, l.e] as [string, Eval]), ['S&P500 보유', longSpy], ['나스닥100 보유 (QQQ)', longQqq],
  ];
  const freq = ddTargets.map(([name, e]) => {
    const years = (Date.parse(e.dates[e.dates.length - 1]) - Date.parse(e.dates[0])) / 3.15576e10;
    const count = (th: number) => drawdowns(e.dates, e.equity, th).length;
    let peak = e.equity[0], below = 0;
    for (const v of e.equity) { peak = Math.max(peak, v); if (v / peak - 1 <= -0.2) below++; }
    return { name, years, d20: count(0.2), d30: count(0.3), d40: count(0.4), d50: count(0.5), timeBelow20: below / e.equity.length, worst: drawdowns(e.dates, e.equity, 0.3) };
  });

  // ── 6. 비중 조절: TQQQ + 변동성 필터 + S&P500 보유, 매년 초 리밸런싱 (세후 곡선 근사, 마지막 청산세 제외) ──
  const tq = main.find(m => m.name === 'TQQQ + 변동성 필터')!.byFee[fi0()];
  const spyMap = new Map(bench.spy.dates.map((d, i) => [d, bench.spy.equity[i]]));
  const tqMap = new Map(tq.dates.map((d, i) => [d, tq.equity[i]]));
  const bDates = tq.dates.filter(d => spyMap.has(d));
  const blends = [1, 0.7, 0.5, 0.3, 0].map(w => {
    let va = w, vb = 1 - w;
    const eq = bDates.map((d, t) => {
      if (t > 0) { va *= tqMap.get(d)! / tqMap.get(bDates[t - 1])!; vb *= spyMap.get(d)! / spyMap.get(bDates[t - 1])!; }
      const v = va + vb;
      if (t < bDates.length - 1 && bDates[t + 1].slice(0, 4) !== d.slice(0, 4)) { va = v * w; vb = v * (1 - w); }
      return v;
    });
    let peak = eq[0], below = 0;
    for (const v of eq) { peak = Math.max(peak, v); if (v / peak - 1 <= -0.2) below++; }
    return { w, s: stats(bDates, eq), d30: drawdowns(bDates, eq, 0.3).length, timeBelow20: below / eq.length };
  });

  // ── 7. 보고서 ──
  const fi = FEES.indexOf(MAIN_FEE);
  const report = `# 개선 후보 검증 (변동성 필터 · 단기국채 · TQQQ)

> 자동 생성: \`bun scripts/research/improve.ts\` · 세후(양도세 22%) · 신호 다음 날 종가 체결 · 목표 비중이 바뀐 날만 매매
> 3차 탐색이다. ①②는 결과를 보기 전에 정했고, TQQQ 적용은 질문을 받고 추가했다. 앞 단계보다 우연일 가능성이 높다.
> 변동성 필터: 목표 비중 × min(1, ^NDX 20일 변동성의 과거 중앙값 ÷ 현재 20일 변동성), 20%p 단위, 하루 늦춰 적용.

## 1. 수수료 수준별 결과 (1995-03 ~ ${main[0].byFee[0].dates.at(-1)})

${md(['방법', '수수료 0.047%', '수수료 0.09%', '수수료 0.25%', '최악 낙폭 (0.09%)', '2010~ (0.09%)', '연 매매일'],
  main.map(m => [m.name, ...m.byFee.map(e => pct(e.full.cagr)), pct(m.byFee[fi].full.mdd), pct(m.byFee[fi].real.cagr), m.byFee[fi].full.tradesPerYear.toFixed(0)]))}
| (참고) S&P500 보유 | - | ${pct(bench.spy.full.cagr)} | - | ${pct(bench.spy.full.mdd)} | ${pct(bench.spy.real.cagr)} | - |
| (참고) 나스닥100 보유 | - | ${pct(bench.qqq.full.cagr)} | - | ${pct(bench.qqq.full.mdd)} | ${pct(bench.qqq.real.cagr)} | - |

SGOV는 이자를 받는 대신 비중을 바꿀 때마다 국채 쪽도 사고팔아야 한다. 수수료 0.09% 이상에서는 이득이 거의 없거나 손해다.

## 2. 채택 기준 (수수료 0.09%)

① 전체 MDD > -80% ② 세후 CAGR > 반도체 1배 보유(${pct(bench.soxx.full.cagr)}) ③ 1995~2010에서도 MDD > -80%, CAGR > ${pct(bench.soxx.oos.cagr)} ④ 아래 3장의 변형 모두 ①② 유지

${md(['후보', '① 생존', '② 수익', '③ 표본 외', '④ 견고성'], ['QLD 기본', 'QLD + 변동성 필터', 'TQQQ 기본', 'TQQQ + 변동성 필터'].map(n => {
  const c = crit(at(n)); const ok = (b: boolean) => (b ? '✅' : '❌');
  return [n, ok(c.c1), ok(c.c2), ok(c.c3), n.includes('필터') ? ok(c4(n)) : '-'];
}))}

## 3. 견고성 (수수료 0.09%, 현금 0%)

${md(['후보', '변형', '전체 CAGR', '전체 MDD', '1995~2010 CAGR', '1995~2010 MDD', '2010~ CAGR'],
  robust.map(r => [r.cand, r.name, pct(r.e.full.cagr), pct(r.e.full.mdd), pct(r.e.oos.cagr), pct(r.e.oos.mdd), pct(r.e.real.cagr)]))}

## 4. 장기 구간 (1986-08 ~, 수수료 0.09%)

1986~1995는 모든 규칙에 대해 표본 외다. 1987년 블랙먼데이(하루 -20% 이상)가 들어 있다.

${md(['방법', '전체 CAGR', '전체 MDD', '1986~1995 CAGR', '1986~1995 MDD'],
  [...long.map(l => [l.name, pct(l.e.full.cagr), pct(l.e.full.mdd), pct(l.e.pre95!.cagr), pct(l.e.pre95!.mdd)]),
   ['S&P500 보유', pct(longSpy.full.cagr), pct(longSpy.full.mdd), pct(longSpy.pre95!.cagr), pct(longSpy.pre95!.mdd)],
   ['나스닥100 보유', pct(longQqq.full.cagr), pct(longQqq.full.mdd), pct(longQqq.pre95!.cagr), pct(longQqq.pre95!.mdd)]])}

## 5. 큰 낙폭이 얼마나 자주 왔나 (1986-08 ~, 40년)

${md(['방법', '-20% 이상', '-30% 이상', '-40% 이상', '-50% 이상', '고점 대비 -20% 아래에 있던 시간'],
  freq.map(f => [f.name, `${f.d20}번`, `${f.d30}번`, `${f.d40}번`, `${f.d50}번`, pct(f.timeBelow20, 0)]))}

## 6. 비중 조절: TQQQ + 변동성 필터 + S&P500 보유 (1995-03 ~, 수수료 0.09%, 매년 초 리밸런싱)

세후 연간 곡선을 합친 근사치다. 마지막 청산 세금은 빼고 계산해 1장 표보다 조금 높다.

${md(['TQQQ 전략 비중', 'CAGR', 'MDD', 'Sharpe', '최악 연도', '-30% 이상 하락', '고점 대비 -20% 아래 시간'],
  blends.map(b => [pct(b.w, 0), pct(b.s.cagr), pct(b.s.mdd), b.s.sharpe.toFixed(2), pct(b.s.worstYear), `${b.d30}번`, pct(b.timeBelow20, 0)]))}

## 7. -30% 이상 빠진 구간 (고점 → 저점, 회복까지)

${freq.map(f => `**${f.name}**\n\n${f.worst.length ? md(['고점', '저점', '깊이', '회복', '고점부터 회복까지'], f.worst.map(w => [w.peak, w.trough, pct(w.depth), w.recovered ?? '미회복', `${w.months}개월`])) : '없음'}`).join('\n\n')}
`;

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'improvements.md'), report);
  writeFileSync(join(OUT, 'improvements.json'), JSON.stringify({
    fees: FEES, mainFee: MAIN_FEE,
    main: main.map(m => ({ name: m.name, byFee: m.byFee.map(e => ({ full: e.full, oos: e.oos, real: e.real })) })),
    bench: Object.fromEntries(Object.entries(bench).map(([k, e]) => [k, { full: e.full, oos: e.oos, real: e.real }])),
    robust: robust.map(r => ({ cand: r.cand, name: r.name, full: r.e.full, oos: r.e.oos, real: r.e.real })),
    long: long.map(l => ({ name: l.name, full: l.e.full, pre95: l.e.pre95 })), freq,
    blends: blends.map(b => ({ w: b.w, full: b.s, d30: b.d30, timeBelow20: b.timeBelow20 })),
  }));
  console.log(report);
}

main().catch(e => { console.error(e); process.exit(1); });
