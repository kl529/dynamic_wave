/**
 * docs/validation/results.json → docs/validation/equity.svg (세후 자산 곡선, 로그 축)
 *   bun scripts/research/chart.ts
 * 팔레트는 dataviz 기준 팔레트 1~5번 (색각 검사 통과). 선 끝에 직접 라벨을 붙여 색에만 의존하지 않는다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dir, '../../docs/validation');
const data = JSON.parse(readFileSync(join(DIR, 'results.json'), 'utf8'));

const SERIES: [string, string, string][] = [
  ['qld_ens', 'QLD 추세 앙상블', '#2a78d6'],
  ['qqq', '나스닥100 보유', '#eb6834'],
  ['spy', 'S&P500 보유', '#1baf7a'],
  ['dongpa', '동파법 SOXL', '#eda100'],
  ['soxl_bh', 'SOXL 보유', '#e87ba4'],
];

const W = 960, H = 440, L = 76, R = 150, T = 20, B = 36;
const curves = SERIES.map(([key, label, color]) => ({ label, color, pts: data.curves[key].points as [string, number][] }));
const t = (d: string) => Date.parse(d);
const t0 = t(curves[0].pts[0][0]), t1 = t(curves[0].pts[curves[0].pts.length - 1][0]);
const all = curves.flatMap(c => c.pts.map(p => p[1]));
const lo = Math.floor(Math.log10(Math.min(...all))), hi = Math.ceil(Math.log10(Math.max(...all)));
const x = (d: string) => L + ((t(d) - t0) / (t1 - t0)) * (W - L - R);
const y = (v: number) => T + ((hi - Math.log10(v)) / (hi - lo)) * (H - T - B);
const fmt = (v: number) => (v >= 1 ? `${v.toLocaleString('en-US')}배` : `${v}배`);

const grid: string[] = [];
for (let e = lo; e <= hi; e++) {
  const v = 10 ** e;
  grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e4e3df" stroke-width="1"/>`,
    `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#6b6a64">${fmt(v)}</text>`);
}
const years: string[] = [];
for (let yr = 1995; yr <= 2025; yr += 5) {
  const d = `${yr}-01-01`;
  years.push(`<text x="${x(d)}" y="${H - 12}" text-anchor="middle" font-size="12" fill="#6b6a64">${yr}</text>`);
}

// 선 끝 라벨: 겹치지 않게 최소 14px 간격으로 밀어낸다
const ends = curves.map(c => ({ c, y: y(c.pts[c.pts.length - 1][1]) })).sort((a, b) => a.y - b.y);
for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 15);

const lines = curves.map(c =>
  `<polyline fill="none" stroke="${c.color}" stroke-width="2" stroke-linejoin="round" points="${c.pts.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}"/>`);
const labels = ends.map(({ c, y: ly }) => {
  const last = c.pts[c.pts.length - 1][1];
  const name = c.label.replace(/&/g, '&amp;');
  return `<circle cx="${W - R + 6}" cy="${ly}" r="4" fill="${c.color}"/><text x="${W - R + 14}" y="${ly + 4}" font-size="12" fill="#2b2a26">${name} ${last >= 10 ? Math.round(last) : last.toFixed(2)}배</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="-apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" role="img" aria-label="1995~2026 세후 자산 곡선 (로그 축)">
<rect width="${W}" height="${H}" fill="#fcfcfb"/>
${grid.join('\n')}
${years.join('\n')}
<line x1="${L}" x2="${W - R}" y1="${y(1)}" y2="${y(1)}" stroke="#9c9b94" stroke-width="1" stroke-dasharray="3 3"/>
${lines.join('\n')}
${labels.join('\n')}
</svg>`;
writeFileSync(join(DIR, 'equity.svg'), svg);
console.log('equity.svg', lo, hi);
