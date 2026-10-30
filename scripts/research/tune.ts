/**
 * 파라미터 조정 검증: "숫자를 바꾸면 더 좋아지나?" → docs/validation/tuning.{md,json}
 *   bun scripts/research/tune.ts
 *
 * 방법 (워크포워드): 한 구간에서 가장 좋은 조합을 고르고, 고를 때 쓰지 않은 다른 구간에서 그 조합을 다시 돌린다.
 *   A = 2010-03-11 ~ 끝 (실제 SOXL·QLD 데이터)   B = 1995-03-01 ~ 2010-03-10 (합성 포함, 닷컴·금융위기)
 * 각 구간은 따로 시작한다(세금 22%, 구간 끝 청산). 지표는 세후 CAGR·MDD.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Run, Series, applyTax, ensembleExposure, loadUniverse, runDivision, runExposure, sliceRun, stats, trendExposure, weeklyOnly,
} from './lib';
import { STRATEGY } from '../../src/lib/strategy';

const OUT = join(import.meta.dir, '../../docs/validation');
const TAX = 0.22;
const A: [string, string] = ['2010-03-11', '9999-12-31'];
const B: [string, string] = ['1995-03-01', '2010-03-10'];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const md = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');

type Score = { cagr: number; mdd: number };
const cut = (s: Series, [from, to]: [string, string]) => s.filter(b => b.date >= from && b.date <= to);

/** run 을 구간으로 자르고 1로 정규화한 뒤 세후 CAGR·MDD */
function score(run: Run, [from, to]: [string, string]): Score {
  const r = sliceRun(run, from, to);
  const t = applyTax(r, TAX);
  const s = stats(r.dates, t.equity, r.shares, t.finalAfterTax);
  return { cagr: s.cagr, mdd: s.mdd };
}

/** 순위 상관 (Spearman): A에서 좋았던 조합이 B에서도 좋은가 */
function spearman(a: number[], b: number[]): number {
  const rank = (v: number[]) => { const o = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]); const r = new Array(v.length); o.forEach(([, i], k) => (r[i] = k)); return r; };
  const ra = rank(a), rb = rank(b), n = a.length, m = (n - 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - m) * (rb[i] - m); da += (ra[i] - m) ** 2; db += (rb[i] - m) ** 2; }
  return num / Math.sqrt(da * db);
}

async function main() {
  const { ndx, spliced } = await loadUniverse(false);
  const always = (s: Series) => s.map(() => 1);
  const bench = {
    spyA: score(runExposure(spliced.SPY, always(spliced.SPY)), A), spyB: score(runExposure(spliced.SPY, always(spliced.SPY)), B),
    qldEnsA: score(runExposure(spliced.QLD, ensembleExposure(spliced.QLD, ndx, [...STRATEGY.periods])), A),
    qldEnsB: score(runExposure(spliced.QLD, ensembleExposure(spliced.QLD, ndx, [...STRATEGY.periods])), B),
  };

  // ── 1. 동파법 조합 (RSI 모드 없이 고정값) ──
  const BUY = [-0.01, -0.02, -0.03, -0.05, -0.08], SELL = [0.01, 0.02, 0.04, 0.08, 0.15, 0.3], HOLD = [5, 10, 20, 40, 80], DIV = [5, 10, 20];
  type Combo = { sym: string; buy: number; sell: number; hold: number; div: number; a: Score; b: Score };
  const combos: Combo[] = [];
  for (const sym of ['SOXL', 'QLD']) {
    const sa = cut(spliced[sym], A), sb = cut(spliced[sym], B);
    for (const buy of BUY) for (const sell of SELL) for (const hold of HOLD) for (const div of DIV) {
      const fixed = { buyTarget: buy, sellTarget: sell, holdingDays: hold };
      combos.push({
        sym, buy, sell, hold, div,
        a: score(runDivision(sa, { hybrid: false, divisions: div, fixed }), A),
        b: score(runDivision(sb, { hybrid: false, divisions: div, fixed }), B),
      });
    }
  }
  const v31 = Object.fromEntries(['SOXL', 'QLD'].map(sym => [sym, {
    a: score(runDivision(cut(spliced[sym], A), { hybrid: false }), A),
    b: score(runDivision(cut(spliced[sym], B), { hybrid: false }), B),
  }]));

  // ── 2. 추세 앙상블 민감도 ──
  const SETS: [string, number[]][] = [
    ['200일 하나', [200]], ['100·200일', [100, 200]], ['50~250일', [50, 100, 150, 200, 250]],
    ['100~300일 (현재)', [...STRATEGY.periods]], ['150~350일', [150, 200, 250, 300, 350]], ['200~300일', [200, 250, 300]],
  ];
  const trend: { set: string; sym: string; freq: string; a: Score; b: Score }[] = [];
  for (const [set, periods] of SETS) for (const sym of ['QQQ', 'QLD', 'TQQQ']) for (const freq of ['매일', '주 1회']) {
    const s = spliced[sym];
    let exp = periods.length === 1 ? trendExposure(s, ndx, periods[0]) : ensembleExposure(s, ndx, periods);
    if (freq === '주 1회') exp = weeklyOnly(s, exp);
    const run = runExposure(s, exp);
    trend.push({ set, sym, freq, a: score(run, A), b: score(run, B) });
  }

  // ── 3. 보고서 ──
  const sections: string[] = [];
  const row = (c: Combo) => [`매수 ${pct(c.buy)} · 매도 +${pct(c.sell)} · ${c.hold}일 · ${c.div}분할`, pct(c.a.cagr), pct(c.a.mdd), pct(c.b.cagr), pct(c.b.mdd)];
  for (const sym of ['SOXL', 'QLD']) {
    const cs = combos.filter(c => c.sym === sym);
    const byA = [...cs].sort((x, y) => y.a.cagr - x.a.cagr), byB = [...cs].sort((x, y) => y.b.cagr - x.b.cagr);
    const beatA = cs.filter(c => c.a.cagr > bench.spyA.cagr).length, beatB = cs.filter(c => c.b.cagr > bench.spyB.cagr).length;
    const beatBoth = cs.filter(c => c.a.cagr > bench.spyA.cagr && c.b.cagr > bench.spyB.cagr).length;
    sections.push(`## 동파법 × ${sym} (${cs.length}개 조합)

| 항목 | A: 2010~ | B: 1995~2010 |
|---|---|---|
| S&P500 보유 | ${pct(bench.spyA.cagr)} | ${pct(bench.spyB.cagr)} |
| QLD 추세 앙상블 | ${pct(bench.qldEnsA.cagr)} | ${pct(bench.qldEnsB.cagr)} |
| 현재 동파법 v3.1 (RSI 자동) | ${pct(v31[sym].a.cagr)} | ${pct(v31[sym].b.cagr)} |
| 조합 중 최고 (사후에 고른 값) | ${pct(byA[0].a.cagr)} | ${pct(byB[0].b.cagr)} |
| 조합 중앙값 | ${pct(byA[Math.floor(cs.length / 2)].a.cagr)} | ${pct(byB[Math.floor(cs.length / 2)].b.cagr)} |
| S&P500보다 높은 조합 | ${beatA}개 | ${beatB}개 |

- 두 구간 모두 S&P500보다 높은 조합: **${beatBoth}개**
- A 1위 조합을 B에 적용: ${pct(byA[0].b.cagr)} (B 구간 순위 ${byB.indexOf(byA[0]) + 1}/${cs.length})
- B 1위 조합을 A에 적용: ${pct(byB[0].a.cagr)} (A 구간 순위 ${byA.indexOf(byB[0]) + 1}/${cs.length})
- A 순위와 B 순위의 상관(Spearman): ${spearman(cs.map(c => c.a.cagr), cs.map(c => c.b.cagr)).toFixed(2)} (1이면 한 구간에서 좋던 조합이 다른 구간에서도 좋음, 0이면 무관)

A 구간 상위 10개 조합과 B 구간 결과:

${md(['조합', 'A CAGR', 'A MDD', 'B CAGR', 'B MDD'], byA.slice(0, 10).map(row))}
`);
  }
  sections.push(`## 추세 앙상블 민감도 (세후 CAGR / MDD)

${md(['이동평균', '상품', '조정', 'A: 2010~', 'B: 1995~2010'], trend.map(t => [t.set, t.sym, t.freq, `${pct(t.a.cagr)} / ${pct(t.a.mdd)}`, `${pct(t.b.cagr)} / ${pct(t.b.mdd)}`]))}
`);
  const report = `# 파라미터 조정 검증

> 자동 생성: \`bun scripts/research/tune.ts\` · A = 2010-03-11 이후(실제 데이터), B = 1995-03-01 ~ 2010-03-10(상장 전은 합성) · 각 구간 따로 시작, 세후(22%), 구간 끝 청산
> 동파법 조합은 RSI 모드 없이 한 가지 값(매수 기준·매도 목표·최대 보유일·분할 수)으로 운용했다. 재분할 주기는 10거래일.

${sections.join('\n')}`;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'tuning.md'), report);
  writeFileSync(join(OUT, 'tuning.json'), JSON.stringify({ bench, v31, combos, trend }));
  console.log(report);
}

main().catch(e => { console.error(e); process.exit(1); });
