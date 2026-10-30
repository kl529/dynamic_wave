/**
 * 전략 검증 스터디. 결과를 docs/validation/results.md, results.json 에 쓴다.
 *   bun scripts/research/run.ts            # 캐시된 데이터 사용
 *   bun scripts/research/run.ts --refresh  # 야후에서 다시 받기
 *
 * 공통 가정: 신호는 t일 종가로 계산, 체결은 t+1일 종가 (LOC/MOC). 수수료 편도 0.047%. 현금 이자 0%.
 * 세금: 해외주식 양도세 22%, 연 실현이익 기준, 마지막 날 전량 청산 가정.
 * 채택 기준(결과를 보기 전에 정함)은 docs/STRATEGY.md 참고.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Run, Series, Stats, FEE, applyTax, ffillOn, periodStats, runDivision, runExposure,
  ensembleExposure, weeklyOnly, loadUniverse, stats, trendExposure, trimRun,
} from './lib';
import { STRATEGY } from '../../src/lib/strategy';

const refresh = process.argv.includes('--refresh');
const OUT = join(import.meta.dir, '../../docs/validation');
const TAX = 0.22;
const EVAL_FROM = '1995-03-01';  // ^SOX 1994-05 시작 + SMA200/주간 RSI 워밍업
const OOS_TO = '2010-03-10';     // SOXL 상장 전날. 동파법·하이브리드 규칙 설계(2010~)에 쓰이지 않은 구간
const SOXL_FROM = '2010-03-11';
const LONG_FROM = '1986-08-01';  // ^NDX 1985-10 시작 + 워밍업. 1987 블랙먼데이 포함
const SMA_N = 200;
const ENS = [...STRATEGY.periods]; // 2차 후보: 추세 앙상블 (결과 보기 전 선언) — 앱과 같은 상수
const ENS_ALT: [string, number[]][] = [['앙상블 50~250', [50, 100, 150, 200, 250]], ['앙상블 150~350', [150, 200, 250, 300, 350]]];

const pct = (x: number, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '-');
const md = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');

type Eval = { name: string; run: Run; afterTax: number[]; full: Stats; fullPreTax: Stats; oos: Stats; real: Stats };
function evaluate(name: string, raw: Run, from = EVAL_FROM): Eval {
  const run = trimRun(raw, from);
  const tax = applyTax(run, TAX);
  return {
    name, run, afterTax: tax.equity,
    full: stats(run.dates, tax.equity, run.shares, tax.finalAfterTax),
    fullPreTax: stats(run.dates, run.equity, run.shares),
    oos: periodStats(run.dates, tax.equity, from, OOS_TO),
    real: periodStats(run.dates, tax.equity, SOXL_FROM, '9999'),
  };
}
const always = (s: Series) => s.map(() => 1);

async function main() {
  // ── 1~2. 데이터와 합성 시계열 (지수 × L배, 실제 ETF와 겹치는 구간에서 drag 보정 후 상장 전 구간을 이어 붙인다) ──
  const { sox, ndx, spx, etf, irx, lastDate, families, tracking, soxlYearly, spliced } = await loadUniverse(refresh);
  const soxl = spliced.SOXL;

  // ── 3. 주요 전략 (평가 구간 1995-03 ~) ──
  const trend = (sym: string, idx: Series, n = SMA_N) => runExposure(spliced[sym], trendExposure(spliced[sym], idx, n));
  const ens = (sym: string, idx: Series, periods = ENS) => runExposure(spliced[sym], ensembleExposure(spliced[sym], idx, periods));
  const cands: { key: string; sym: string; idx: Series; kind: 'sma' | 'ens'; label: string }[] = [
    { key: 'soxl_trend', sym: 'SOXL', idx: sox, kind: 'sma', label: 'SOXL 추세 (^SOX > SMA200)' },
    { key: 'usd_trend', sym: 'USD', idx: sox, kind: 'sma', label: 'USD 추세 (^SOX > SMA200, 반도체 2배)' },
    { key: 'qld_trend', sym: 'QLD', idx: ndx, kind: 'sma', label: 'QLD 추세 (^NDX > SMA200, 나스닥 2배)' },
    { key: 'tqqq_trend', sym: 'TQQQ', idx: ndx, kind: 'sma', label: 'TQQQ 추세 (^NDX > SMA200, 나스닥 3배)' },
    { key: 'sso_trend', sym: 'SSO', idx: spx, kind: 'sma', label: 'SSO 추세 (^GSPC > SMA200, S&P 2배)' },
    { key: 'upro_trend', sym: 'UPRO', idx: spx, kind: 'sma', label: 'UPRO 추세 (^GSPC > SMA200, S&P 3배)' },
    { key: 'soxl_ens', sym: 'SOXL', idx: sox, kind: 'ens', label: 'SOXL 앙상블 (^SOX, SMA100~300)' },
    { key: 'usd_ens', sym: 'USD', idx: sox, kind: 'ens', label: 'USD 앙상블 (^SOX, 반도체 2배)' },
    { key: 'qld_ens', sym: 'QLD', idx: ndx, kind: 'ens', label: 'QLD 앙상블 (^NDX, 나스닥 2배)' },
    { key: 'tqqq_ens', sym: 'TQQQ', idx: ndx, kind: 'ens', label: 'TQQQ 앙상블 (^NDX, 나스닥 3배)' },
    { key: 'sso_ens', sym: 'SSO', idx: spx, kind: 'ens', label: 'SSO 앙상블 (^GSPC, S&P 2배)' },
    { key: 'upro_ens', sym: 'UPRO', idx: spx, kind: 'ens', label: 'UPRO 앙상블 (^GSPC, S&P 3배)' },
  ];
  const main: (Eval & { key: string; group: string })[] = [
    { key: 'spy', group: '기준', ...evaluate('S&P500 보유 (SPY)', runExposure(spliced.SPY, always(spliced.SPY))) },
    { key: 'qqq', group: '기준', ...evaluate('나스닥100 보유 (QQQ)', runExposure(spliced.QQQ, always(spliced.QQQ))) },
    { key: 'soxx', group: '기준', ...evaluate('반도체 1배 보유 (SOXX)', runExposure(spliced.SOXX, always(spliced.SOXX))) },
    { key: 'soxl_bh', group: '기준', ...evaluate('SOXL 보유', runExposure(soxl, always(soxl))) },
    { key: 'dongpa', group: '기존', ...evaluate('동파법 v3.1 (RSI 자동, 10분할)', runDivision(soxl, { hybrid: false })) },
    { key: 'hybrid', group: '기존', ...evaluate('하이브리드 ★최종 (RSI+SMA50→B&H / 동파)', runDivision(soxl, { hybrid: true })) },
    { key: 'hybrid_cash', group: '기존', ...evaluate('하이브리드, 동파 대신 현금 (대조군)', runDivision(soxl, { hybrid: true, noDongpaBuys: true })) },
    ...cands.map(c => ({ key: c.key, group: c.kind === 'sma' ? '후보' : '2차 후보', ...evaluate(c.label, c.kind === 'sma' ? trend(c.sym, c.idx) : ens(c.sym, c.idx)) })),
  ];
  const bench = main.find(r => r.key === 'soxx')!;

  // ── 4. 채택 기준 ──
  const judged = main.filter(r => r.group !== '기준').map(r => ({
    key: r.key, name: r.name,
    c1: r.full.mdd > -0.8, c2: r.full.cagr > bench.full.cagr, c3: r.oos.mdd > -0.8 && r.oos.cagr > bench.oos.cagr,
  }));

  // ── 5. 견고성: 기준 ①②③을 통과한 후보만 ──
  const passed = judged.filter(j => j.c1 && j.c2 && j.c3).map(j => j.key);
  const rates = (s: Series) => ffillOn(s.map(b => b.date), irx);
  const robust: { cand: string; name: string; full: Stats; oos: Stats; real: Stats; beatsBench: boolean }[] = [];
  for (const c of cands.filter(c => passed.includes(c.key))) {
    const { sym, idx } = c;
    const s = spliced[sym];
    const exp = c.kind === 'sma' ? trendExposure(s, idx, SMA_N) : ensembleExposure(s, idx, ENS);
    const variants: [string, Run][] = c.kind === 'sma' ? [
      ...[100, 150, 200, 250, 300].map(n => [`SMA${n}`, trend(sym, idx, n)] as [string, Run]),
      [`${sym} 자체 > SMA200`, runExposure(s, trendExposure(s, s, 200))],
    ] : [
      ['앙상블 100~300', ens(sym, idx)],
      ...ENS_ALT.map(([name, p]) => [name, ens(sym, idx, p)] as [string, Run]),
      [`${sym} 자체 앙상블`, runExposure(s, ensembleExposure(s, s, ENS))],
    ];
    variants.push(
      ['수수료 0.25%', runExposure(s, exp, 0.0025)],
      ['현금 구간 단기국채 이자', runExposure(s, exp, FEE, rates(s))],
      ['주 1회만 조정 (참고)', runExposure(s, weeklyOnly(s, exp))],
    );
    for (const [name, run] of variants) {
      const e = evaluate(name, run);
      robust.push({ cand: c.key, name, full: e.full, oos: e.oos, real: e.real, beatsBench: e.full.cagr > bench.full.cagr });
    }
  }
  // ④: SMA 후보는 SMA150/200/250, 앙상블 후보는 세 가지 구성 모두 ② 유지
  const c4 = (key: string) => robust.filter(r => r.cand === key && /^(SMA(150|200|250)|앙상블 )/.test(r.name)).every(r => r.beatsBench);

  // ── 6. 레버리지 배수 · 기초자산 그리드 ──
  const grid: { name: string; full: Stats; oos: Stats; real: Stats }[] = [];
  for (const f of families) f.etfs.forEach((sym, i) => {
    for (const [mode, exp] of [['보유', always(spliced[sym])], ['추세200', trendExposure(spliced[sym], f.index, SMA_N)], ['앙상블', ensembleExposure(spliced[sym], f.index, ENS)]] as const) {
      const e = evaluate(`${f.label} ${i + 1}배 ${mode} (${sym})`, runExposure(spliced[sym], exp as number[]));
      grid.push({ name: e.name, full: e.full, oos: e.oos, real: e.real });
    }
  });

  // ── 7. 장기 구간 (1986-08 ~, 나스닥·S&P만): 1987 블랙먼데이, 닷컴, 금융위기 모두 포함 ──
  const long: { name: string; full: Stats; pre95: Stats }[] = [];
  for (const f of families.filter(f => f.key !== 'SOX')) f.etfs.forEach((sym, i) => {
    for (const [mode, exp] of [['보유', always(spliced[sym])], ['추세200', trendExposure(spliced[sym], f.index, SMA_N)], ['앙상블', ensembleExposure(spliced[sym], f.index, ENS)]] as const) {
      const e = evaluate(`${f.label} ${i + 1}배 ${mode}`, runExposure(spliced[sym], exp as number[]), LONG_FROM);
      long.push({ name: e.name, full: e.full, pre95: periodStats(e.run.dates, e.afterTax, LONG_FROM, '1995-02-28') });
    }
  });

  // ── 8. 선정: 기준 ①~④ 통과 후보 중 세후 CAGR 최고. 1위와 10% 이내면 더 단순한 규칙(단일 SMA)을 택한다 ──
  const finalists = main.filter(r => passed.includes(r.key) && c4(r.key)).sort((a, b) => b.full.cagr - a.full.cagr);
  const simple = finalists.find(r => r.key.endsWith('_trend') && finalists[0] && r.full.cagr >= finalists[0].full.cagr * 0.9);
  const pick = simple ?? finalists[0];

  // ── 9. 비중 조절: 선정 전략(없으면 ①~③ 통과 중 CAGR 최고) + SPY 보유, 매년 초 리밸런싱 (세후 곡선 근사) ──
  const blendBase = pick ?? main.filter(r => passed.includes(r.key)).sort((a, b) => b.full.cagr - a.full.cagr)[0];
  const blends: { w: number; full: Stats }[] = [];
  if (blendBase) {
    const pick = blendBase;
    const spyE = main.find(r => r.key === 'spy')!;
    const spyMap = new Map(spyE.run.dates.map((d, i) => [d, spyE.afterTax[i]]));
    const pickMap = new Map(pick.run.dates.map((d, i) => [d, pick.afterTax[i]]));
    const dates = pick.run.dates.filter(d => spyMap.has(d));
    const a = dates.map(d => pickMap.get(d)!);
    const b = dates.map(d => spyMap.get(d)!);
    for (const w of [1, 0.7, 0.5, 0.3, 0]) {
      let va = w, vb = 1 - w;
      const eq = dates.map((d, t) => {
        if (t > 0) { va *= a[t] / a[t - 1]; vb *= b[t] / b[t - 1]; }
        const v = va + vb;
        if (t < dates.length - 1 && dates[t + 1].slice(0, 4) !== d.slice(0, 4)) { va = v * w; vb = v * (1 - w); }
        return v;
      });
      blends.push({ w, full: stats(dates, eq) });
    }
  }

  // ── 10. 보고서 ──
  const stress: [string, string, string][] = [
    ['닷컴 붕괴', '2000-03-10', '2002-10-09'], ['금융위기', '2007-10-09', '2009-03-09'],
    ['2018 하락', '2018-03-12', '2018-12-24'], ['코로나', '2020-02-19', '2020-03-23'], ['2022 하락', '2022-01-03', '2022-10-14'],
  ];
  const years = Object.keys(main[0].full.yearly);
  const row = (name: string, s: Stats, extra: (string | number)[] = []) =>
    [name, pct(s.cagr), pct(s.mdd), s.sharpe.toFixed(2), pct(s.worstYear), pct(s.roll5Min), ...extra];
  const ok = (b: boolean) => (b ? '✅' : '❌');

  const report = `# 전략 검증 결과

> 자동 생성: \`bun scripts/research/run.ts\` · 데이터 마지막 날짜 ${lastDate} · 평가 시작 ${EVAL_FROM}
> 체결: 신호 다음 거래일 종가 · 수수료 편도 ${(FEE * 100).toFixed(3)}% · 현금 이자 0% · 양도세 ${TAX * 100}%(연 실현이익, 마지막 날 청산 가정)
> 각 ETF 상장 전 구간은 기초지수 × 배수로 만든 합성 시계열이다 (1장에서 실제 ETF와 비교 검증).

## 1. 합성 시계열 검증 (실제 ETF와 겹치는 구간)

${md(['ETF', '겹치는 거래일', '일간 수익률 상관', '연 추적오차', '보정 drag(연)'],
  tracking.map(t => [t.pair, t.days, t.corr.toFixed(4), pct(t.te), pct(t.drag, 2)]))}

SOXL 연도별 수익률 (합성 / 실제):

${md(['연도', '합성', '실제', '차이'], soxlYearly.map(y => [y.year, pct(y.synth), pct(y.real), pct(y.synth - y.real)]))}

## 2. 전체 기간 (${EVAL_FROM} ~ ${lastDate}, 세후)

${md(['구분', '전략', 'CAGR', 'MDD', 'Sharpe', '최악 연도', '5년 최저 CAGR', '세전 CAGR', '시장 노출', '연 매매일수'],
  main.map(r => [r.group, ...row(r.name, r.full, [pct(r.fullPreTax.cagr), pct(r.full.timeInMarket, 0), r.full.tradesPerYear.toFixed(1)])]))}

## 3. 표본 외 구간 (${EVAL_FROM} ~ ${OOS_TO})

동파법·하이브리드 규칙은 2010년 이후 데이터로 만들어졌다. 이 구간은 닷컴 붕괴와 금융위기를 포함한다.

${md(['구분', '전략', 'CAGR', 'MDD', 'Sharpe', '최악 연도', '5년 최저 CAGR'], main.map(r => [r.group, ...row(r.name, r.oos)]))}

## 4. 실제 SOXL 구간 (${SOXL_FROM} ~ ${lastDate})

${md(['구분', '전략', 'CAGR', 'MDD', 'Sharpe', '최악 연도', '5년 최저 CAGR'], main.map(r => [r.group, ...row(r.name, r.real)]))}

## 5. 폭락 구간 수익률 (세후)

${md(['전략', ...stress.map(s => `${s[0]} (${s[1].slice(0, 7)}~${s[2].slice(0, 7)})`)],
  main.map(r => [r.name, ...stress.map(([, a, b]) => pct(periodStats(r.run.dates, r.afterTax, a, b).total))]))}

## 6. 연도별 수익률 (세후)

${md(['연도', ...main.map(r => r.key)], years.map(y => [y, ...main.map(r => pct(r.full.yearly[y] ?? NaN, 0))]))}

## 7. 채택 기준 판정

① 전체 MDD > -80% ② 전체 세후 CAGR > 반도체 1배 보유(${pct(bench.full.cagr)}) ③ 표본 외 구간 MDD > -80% 이고 CAGR > 반도체 1배(${pct(bench.oos.cagr)}) ④ 파라미터를 바꿔도 ② 유지 — SMA 후보는 SMA150/200/250, 앙상블 후보는 세 가지 구성 (8장)

'2차 후보'(추세 앙상블)는 1차 결과를 본 뒤, 결과를 보기 전에 선언하고 추가한 것이다. 다중 검정 위험이 있어 더 보수적으로 해석한다.

${md(['전략', '① 생존', '② 수익', '③ 표본 외', '④ 견고성'],
  judged.map(j => [j.name, ok(j.c1), ok(j.c2), ok(j.c3), passed.includes(j.key) ? ok(c4(j.key)) : '-']))}

**선정: ${pick ? `${pick.name} — 세후 CAGR ${pct(pick.full.cagr)}, MDD ${pct(pick.full.mdd)}` : '기준을 모두 통과한 전략 없음'}**
${finalists.length > 1 ? `\n통과 후보 (세후 CAGR 순): ${finalists.map(f => `${f.name} ${pct(f.full.cagr)}`).join(' · ')}` : ''}

## 8. 견고성 (①~③ 통과 후보, 세후)

${md(['후보', '변형', '전체 CAGR', '전체 MDD', '표본 외 CAGR', '표본 외 MDD', '2010~ CAGR', '연 매매일수'],
  robust.map(r => [r.cand, r.name, pct(r.full.cagr), pct(r.full.mdd), pct(r.oos.cagr), pct(r.oos.mdd), pct(r.real.cagr), r.full.tradesPerYear.toFixed(1)]))}

## 9. 레버리지 배수 · 기초자산 (${EVAL_FROM} ~, 세후)

${md(['조합', '전체 CAGR', '전체 MDD', 'Sharpe', '표본 외 CAGR', '표본 외 MDD', '2010~ CAGR', '5년 최저 CAGR'],
  grid.map(g => [g.name, pct(g.full.cagr), pct(g.full.mdd), g.full.sharpe.toFixed(2), pct(g.oos.cagr), pct(g.oos.mdd), pct(g.real.cagr), pct(g.full.roll5Min)]))}

## 10. 장기 구간 (${LONG_FROM} ~, 나스닥100·S&P500, 세후)

1987 블랙먼데이부터 포함. ${LONG_FROM} ~ 1995-02 은 모든 규칙에 대해 또 하나의 표본 외 구간이다.

${md(['조합', '전체 CAGR', '전체 MDD', 'Sharpe', '1986~1995 CAGR', '1986~1995 MDD', '5년 최저 CAGR'],
  long.map(l => [l.name, pct(l.full.cagr), pct(l.full.mdd), l.full.sharpe.toFixed(2), pct(l.pre95.cagr), pct(l.pre95.mdd), pct(l.full.roll5Min)]))}

## 11. 비중 조절: ${blendBase ? blendBase.name : '-'} + S&P500 보유 (매년 초 리밸런싱, 근사)

${blendBase ? md(['전략 비중', 'CAGR', 'MDD', 'Sharpe', '최악 연도', '5년 최저 CAGR'],
  blends.map(b => [pct(b.w, 0), pct(b.full.cagr), pct(b.full.mdd), b.full.sharpe.toFixed(2), pct(b.full.worstYear), pct(b.full.roll5Min)])) : '-'}
`;

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'results.md'), report);
  const curves = Object.fromEntries(main.map(r => [r.key, {
    name: r.name, group: r.group,
    points: r.run.dates.map((d, i) => [d, +r.afterTax[i].toPrecision(6)] as const).filter((_, i, a) => i % 5 === 0 || i === a.length - 1),
  }]));
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({
    lastDate, evalFrom: EVAL_FROM, oosTo: OOS_TO, longFrom: LONG_FROM, fee: FEE, tax: TAX, tracking, soxlYearly,
    pick: pick?.key ?? null, blendBase: blendBase?.key ?? null, bench: bench.key,
    summary: main.map(r => ({ key: r.key, group: r.group, name: r.name, full: r.full, fullPreTax: r.fullPreTax, oos: r.oos, real: r.real })),
    judged, robust, grid, long, blends, curves,
  }));
  console.log(report);
}

main().catch(e => { console.error(e); process.exit(1); });
