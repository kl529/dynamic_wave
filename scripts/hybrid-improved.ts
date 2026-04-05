/**
 * 하이브리드 개선 버전: B&H + 동파법 + 필터
 * npx tsx --tsconfig tsconfig.json scripts/hybrid-improved.ts
 *
 * 4가지 비교:
 *   v0: 기본 하이브리드 (필터 없음)
 *   v1: + 최소보유 10일 (전환 후 10거래일간 재전환 금지)
 *   v2: + SMA50 필터 (가격 > SMA50일 때만 B&H 진입)
 *   v3: + 둘 다 (최소보유 + SMA50)
 */

interface MarketData {
  date: string; price: number; change: number; changePercent: number;
  volume: number; high: number; low: number; open: number;
}
interface Division {
  n: number; status: 'EMPTY' | 'HOLDING';
  cash: number; shares: number; avgPrice: number;
  buyDate: string; totalCost: number; sellTarget: number; holdingDays: number;
}

const FEE = 0.00044 + 0.0000278;
const IC = 10000;
type ModeKey = 'safe' | 'aggressive' | 'bull' | 'cash';
type StratMode = 'bnh' | 'dongpa' | 'cash';

interface ModeConfig { buyTarget: number; sellTarget: number; holdingDays: number; }
const CONFIGS: Record<'safe'|'aggressive'|'bull', ModeConfig> = {
  safe:       { buyTarget: -0.03, sellTarget: 0.02,  holdingDays: 20 },
  aggressive: { buyTarget: -0.05, sellTarget: 0.08,  holdingDays: 7  },
  bull:       { buyTarget: -0.03, sellTarget: 0.12,  holdingDays: 45 },
};
const N_DIV = 10, REBAL = 10;
const MIN_HOLD_DAYS = 10;  // 최소 보유기간
const SMA_PERIOD = 50;     // SMA 기간

// ── 유틸 ──────────────────────────────────────────────────────
function tradingDays(from: string, to: string): number {
  const [fy,fm,fd] = from.split('-').map(Number);
  const [ty,tm,td] = to.split('-').map(Number);
  const s = Date.UTC(fy,fm-1,fd), e = Date.UTC(ty,tm-1,td);
  if (s > e) return 0;
  const total = Math.floor((e-s)/86400000)+1;
  const full = Math.floor(total/7);
  let n = full*5;
  const dow0 = new Date(s).getUTCDay();
  for (let i = 0; i < total%7; i++) { const d=(dow0+i)%7; if(d&&d!==6) n++; }
  return n;
}

function weekNum(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const day = d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-day);
  const y = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d.getTime()-y.getTime())/86400000)+1)/7);
}

function computeRsiModes(all: MarketData[]): Map<string, ModeKey> {
  const weeks: Record<string, MarketData[]> = {};
  for (const d of all) {
    const dt = new Date(d.date);
    const k = `${dt.getFullYear()}-W${String(weekNum(dt)).padStart(2,'0')}`;
    (weeks[k]??=[]).push(d);
  }
  const weekly = Object.keys(weeks).sort().map(k => {
    const wd = weeks[k];
    return wd.find(d => new Date(d.date).getDay()===5) ?? wd[wd.length-1];
  });
  const P = 14;
  if (weekly.length < P+1) return new Map(all.map(d=>[d.date,'safe']));
  const px = weekly.map(d=>d.price);
  const rsi: (number|null)[] = new Array(px.length).fill(null);
  let ag=0, al=0;
  for (let i=1;i<=P;i++) { const c=px[i]-px[i-1]; c>0?ag+=c:al+=Math.abs(c); }
  ag/=P; al/=P;
  rsi[P] = al===0?100:100-100/(1+ag/al);
  for (let i=P+1;i<px.length;i++) {
    const c=px[i]-px[i-1];
    ag=(ag*(P-1)+(c>0?c:0))/P;
    al=(al*(P-1)+(c<0?Math.abs(c):0))/P;
    rsi[i] = al===0?100:100-100/(1+ag/al);
  }
  const rsiMap = new Map(weekly.map((w,i)=>[w.date,{rsi:rsi[i],prev:i>0?rsi[i-1]:null}]));
  let last: ModeKey='safe';
  const out = new Map<string, ModeKey>();
  for (const d of all) {
    const w = rsiMap.get(d.date);
    if (w?.rsi!=null && w.prev!=null) {
      const [c,p,up,dn] = [w.rsi,w.prev,w.rsi>w.prev,w.rsi<w.prev];
      if (dn&&c<40)               last='cash';
      else if (dn||(p>=50&&c<50)||c>65) last='safe';
      else if (c>=55&&c<=65&&up)  last='bull';
      else if (up||(p<50&&c>=50)) last='aggressive';
    }
    out.set(d.date, last);
  }
  return out;
}

function computeSMA(all: MarketData[], period: number): Map<string, number> {
  const out = new Map<string, number>();
  for (let i=period-1; i<all.length; i++) {
    const avg = all.slice(i-period+1,i+1).reduce((s,d)=>s+d.price,0)/period;
    out.set(all[i].date, avg);
  }
  return out;
}

// ── 분할 엔진 ──────────────────────────────────────────────────
function makeDivs(totalCash: number): Division[] {
  const amt = totalCash / N_DIV;
  return Array.from({length:N_DIV},(_,i)=>({
    n:i+1, status:'EMPTY' as const, cash:amt, shares:0, avgPrice:0,
    buyDate:'', totalCost:0, sellTarget:0, holdingDays:0
  }));
}

function divTotalValue(divs: Division[], price: number): number {
  return divs.reduce((s,d)=>s+d.cash+(d.status==='HOLDING'?d.shares*price:0), 0);
}

function liquidateDivs(divs: Division[], price: number): number {
  return divs.reduce((s,d) => {
    if (d.status==='HOLDING' && d.shares>0) return s + d.shares*price*(1-FEE);
    return s + d.cash;
  }, 0);
}

function rebalDivs(divs: Division[], price: number): Division[] {
  const tc = divs.reduce((s,d)=>s+d.cash,0);
  const ts = divs.reduce((s,d)=>s+(d.status==='HOLDING'?d.shares*price:0),0);
  const target = (tc+ts)/N_DIV;
  let need = 0;
  const needs = divs.map(d => {
    if (d.status!=='HOLDING') return 0;
    const n = Math.max(0, target - d.shares*price); need+=n; return n;
  });
  const scale = need>0?Math.min(1,tc/need):1;
  const rem = tc - needs.reduce((s,n)=>s+n*scale,0);
  const ec = divs.filter(d=>d.status==='EMPTY').length;
  const cpe = ec>0?rem/ec:0;
  return divs.map((d,i) => d.status==='HOLDING'
    ? {...d, cash: needs[i]*scale}
    : {...d, cash:cpe, shares:0, avgPrice:0, buyDate:'', totalCost:0, sellTarget:0, holdingDays:0, status:'EMPTY' as const}
  );
}

function stepDivs(
  divs: Division[], nextIdx: number, date: string, price: number,
  prevPrice: number|null, rsiMode: ModeKey, step: number
): { divs: Division[]; nextIdx: number } {
  const cfg = CONFIGS[rsiMode==='cash'?'safe':rsiMode];

  // 리밸런싱
  if (step>0 && step%REBAL===0) divs = rebalDivs(divs, price);

  // 매도 체크
  divs = divs.map(d => {
    if (d.status!=='HOLDING') return d;
    const td = d.buyDate ? tradingDays(d.buyDate, date) : 0;
    const hit = price >= d.sellTarget && d.sellTarget > 0;
    const expired = td >= d.holdingDays;
    if (hit || expired) {
      const sp = hit && !expired ? d.sellTarget : price;
      return {...d, status:'EMPTY' as const, cash: d.shares*sp*(1-FEE),
              shares:0, avgPrice:0, buyDate:'', totalCost:0, sellTarget:0, holdingDays:0};
    }
    return d;
  });

  // 다음 빈 분할 찾기
  let foundIdx = -1;
  for (let i=0; i<divs.length; i++) {
    const idx = (nextIdx+i)%divs.length;
    if (divs[idx].status==='EMPTY') { foundIdx=idx; break; }
  }
  if (foundIdx >= 0) nextIdx = foundIdx;

  // 매수 체크 (하락장 제외)
  if (rsiMode!=='cash' && prevPrice && foundIdx>=0) {
    const d = divs[foundIdx];
    const chg = (price-prevPrice)/prevPrice;
    if (d.cash >= 100 && chg <= cfg.buyTarget) {
      const qty = Math.floor(d.cash / (price*(1+FEE)));
      if (qty > 0) {
        const cost = qty*price*(1+FEE);
        divs[foundIdx] = {...d, status:'HOLDING' as const, cash:d.cash-cost,
          shares:qty, avgPrice:price, buyDate:date, totalCost:cost,
          sellTarget:price*(1+cfg.sellTarget), holdingDays:cfg.holdingDays};
        nextIdx = (foundIdx+1)%N_DIV;
      }
    }
  }

  return {divs, nextIdx};
}

// ── 하이브리드 엔진 ────────────────────────────────────────────
interface HybridOpts { minHold: boolean; smaFilter: boolean; }

interface DaySnap {
  date: string; rsiMode: ModeKey; stratMode: StratMode;
  totalAssets: number; transitioned: boolean;
}

function runHybrid(
  yearData: MarketData[], allModeMap: Map<string,ModeKey>, smaMap: Map<string,number>,
  opts: HybridOpts
): DaySnap[] {
  let stratMode: StratMode = 'dongpa';
  let bnhShares = 0, freeCash = IC;
  let divs = makeDivs(IC);
  let nextDivIdx = 0;
  let daysSinceTrans = 999;
  let step = 0;
  const snaps: DaySnap[] = [];

  for (let i=0; i<yearData.length; i++) {
    const d = yearData[i];
    const prevPrice = i>0 ? yearData[i-1].price : null;
    const rsiMode = allModeMap.get(d.date) ?? 'safe';
    daysSinceTrans++;

    // 목표 전략 모드 결정
    const targetBnh = rsiMode==='aggressive' || rsiMode==='bull';
    const targetCash = rsiMode==='cash';
    let desiredMode: StratMode = targetBnh ? 'bnh' : targetCash ? 'cash' : 'dongpa';

    // 필터 1: 최소보유기간
    const lockPassed = !opts.minHold || daysSinceTrans >= MIN_HOLD_DAYS;

    // 필터 2: SMA 필터 (B&H 진입 시에만)
    let smaOk = true;
    if (opts.smaFilter && desiredMode === 'bnh') {
      const sma = smaMap.get(d.date);
      if (sma && d.price < sma) smaOk = false; // 가격이 SMA 아래 → B&H 진입 차단
    }

    // 전환 가능 여부
    const canTransit = lockPassed && (desiredMode !== 'bnh' || smaOk);
    if (!canTransit) desiredMode = stratMode; // 필터 통과 못 하면 현재 모드 유지

    const transitioned = desiredMode !== stratMode;

    if (transitioned) {
      daysSinceTrans = 0;
      if (desiredMode === 'bnh') {
        // Dongpa/Cash → B&H
        const cash = liquidateDivs(divs, d.price) + freeCash;
        const qty = Math.floor(cash / (d.price*(1+FEE)));
        bnhShares = qty;
        freeCash = cash - qty*d.price*(1+FEE);
        divs = makeDivs(0);
      } else if (desiredMode === 'dongpa') {
        // B&H/Cash → Dongpa
        const cash = bnhShares*d.price*(1-FEE) + freeCash;
        bnhShares = 0; freeCash = 0;
        divs = makeDivs(cash);
        nextDivIdx = 0; step = 0;
      } else {
        // → Cash: 전량 청산
        const cash = bnhShares*d.price*(1-FEE) + liquidateDivs(divs, d.price) + freeCash;
        bnhShares = 0; freeCash = cash;
        divs = makeDivs(0);
      }
      stratMode = desiredMode;
    }

    // 모드별 운영
    let totalAssets: number;
    if (stratMode === 'bnh') {
      totalAssets = bnhShares*d.price + freeCash;
    } else if (stratMode === 'cash') {
      totalAssets = freeCash;
    } else {
      const res = stepDivs(divs, nextDivIdx, d.date, d.price, prevPrice, rsiMode, step);
      divs = res.divs; nextDivIdx = res.nextIdx; step++;
      totalAssets = divTotalValue(divs, d.price);
    }

    snaps.push({date:d.date, rsiMode, stratMode, totalAssets, transitioned});
  }
  return snaps;
}

function calcStats(snaps: DaySnap[], yearData: MarketData[]) {
  if (!snaps.length) return null;
  const last = snaps[snaps.length-1];
  let peak = IC, mdd = 0;
  for (const s of snaps) {
    if (s.totalAssets > peak) peak = s.totalAssets;
    const dd = (peak-s.totalAssets)/peak*100;
    if (dd > mdd) mdd = dd;
  }
  const bnh = ((yearData[yearData.length-1].price - yearData[0].price)/yearData[0].price)*100;
  const trans = snaps.filter(s=>s.transitioned).length;
  const bnhDays = snaps.filter(s=>s.stratMode==='bnh').length;
  const cashDays = snaps.filter(s=>s.stratMode==='cash').length;
  const dpDays = snaps.filter(s=>s.stratMode==='dongpa').length;
  return {
    ret: ((last.totalAssets-IC)/IC)*100, mdd, bnh, trans,
    bnhPct: Math.round(bnhDays/snaps.length*100),
    cashPct: Math.round(cashDays/snaps.length*100),
    dpPct: Math.round(dpDays/snaps.length*100),
  };
}

async function fetchSOXL(): Promise<MarketData[]> {
  const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/SOXL?range=6000d&interval=1d',
    {headers:{'User-Agent':'Mozilla/5.0'}});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const r = json.chart?.result?.[0];
  if (!r) throw new Error('no data');
  const ts: number[]=r.timestamp||[];
  const cl: number[]=r.indicators?.quote?.[0]?.close||[];
  const op: number[]=r.indicators?.quote?.[0]?.open||[];
  const hi: number[]=r.indicators?.quote?.[0]?.high||[];
  const lo: number[]=r.indicators?.quote?.[0]?.low||[];
  const vo: number[]=r.indicators?.quote?.[0]?.volume||[];
  return ts.map((t,i)=>{
    const price=Number((cl[i]||0).toFixed(2));
    const prev=i>0?(cl[i-1]||price):price;
    return {date:new Date(t*1000).toISOString().split('T')[0], price,
            change:Number((price-prev).toFixed(2)),
            changePercent:Number(((price-prev)/prev*100).toFixed(2)),
            volume:vo[i]||0, high:Number((hi[i]||price).toFixed(2)),
            low:Number((lo[i]||price).toFixed(2)), open:Number((op[i]||price).toFixed(2))};
  }).filter(d=>d.price>0);
}

async function main() {
  console.log('SOXL 데이터 로드 중...');
  const raw = await fetchSOXL();
  const firstDate = raw[0].date, lastDate = raw[raw.length-1].date;
  console.log(`총 ${raw.length}거래일 (${firstDate} ~ ${lastDate})\n`);

  // 전체 데이터 기준 모드맵 & SMA (연속성 보장)
  const modeMap = computeRsiModes(raw);
  const smaMap  = computeSMA(raw, SMA_PERIOD);

  const startYear = parseInt(firstDate.split('-')[0]);
  const endYear   = parseInt(lastDate.split('-')[0]);

  const variants: { label: string; opts: HybridOpts }[] = [
    { label: '기본',          opts: { minHold: false, smaFilter: false } },
    { label: '+최소보유10일', opts: { minHold: true,  smaFilter: false } },
    { label: '+SMA50',        opts: { minHold: false, smaFilter: true  } },
    { label: '+둘다',         opts: { minHold: true,  smaFilter: true  } },
  ];

  type Row = {
    year: number; days: number; bnh: number;
    rets: number[]; mdds: number[]; trans: number[];
    bnhPcts: number[]; cashPcts: number[];
  };
  const rows: Row[] = [];

  for (let yr = startYear; yr <= endYear; yr++) {
    const s=`${yr}-01-01`, e=`${yr}-12-31`;
    const yd = raw.filter(d=>d.date>=s&&d.date<=e);
    if (yd.length < 10) continue;

    const rets: number[]=[], mdds: number[]=[], trans: number[]=[], bnhPcts: number[]=[], cashPcts: number[]=[];
    let bnh=0;
    for (const v of variants) {
      const snaps = runHybrid(yd, modeMap, smaMap, v.opts);
      const st = calcStats(snaps, yd);
      if (!st) continue;
      rets.push(st.ret); mdds.push(st.mdd); trans.push(st.trans);
      bnhPcts.push(st.bnhPct); cashPcts.push(st.cashPct);
      bnh = st.bnh;
    }
    rows.push({year:yr, days:yd.length, bnh, rets, mdds, trans, bnhPcts, cashPcts});
  }

  // ── 출력 ──────────────────────────────────────────────────────
  const f = (v:number) => (v>=0?'+':'')+v.toFixed(1)+'%';
  const W = 125;

  console.log('='.repeat(W));
  console.log('  하이브리드 개선 비교 (상승장→B&H / 하락장→동파법v3.1)');
  console.log('  필터1: 최소보유 10거래일 (전환 후 재전환 대기)');
  console.log(`  필터2: SMA${SMA_PERIOD} (가격이 SMA 위일 때만 B&H 진입)`);
  console.log('='.repeat(W));

  const hdr = ['연도','일수','기본','최소보유','SMA50','둘다','│B&H','│MDD기본','MDD둘다','│전환기본','전환둘다','│B&H일%','캐시%'];
  console.log('  '+['연도','일수',...variants.map(v=>v.label),'│B&H','│기본MDD','둘다MDD','│기본전환','둘다전환']
    .map((s,i)=>s.padEnd([6,5,13,14,10,10,10,10,10,11,11][i]??10)).join(''));
  console.log('-'.repeat(W));

  const totals = variants.map(()=>1);
  let totBnh = 1;

  for (const r of rows) {
    if (r.rets.length < 4) continue;
    const best = Math.max(...r.rets);
    const marks = r.rets.map(v=>v===best?'★':' ');
    console.log(
      '  '+String(r.year).padEnd(6)+String(r.days).padEnd(5)+
      r.rets.map((v,i)=>(marks[i]+f(v)).padEnd(i===0?13:14)).join('')+
      '│'+f(r.bnh).padEnd(10)+
      '│'+('-'+r.mdds[0].toFixed(1)+'%').padEnd(10)+('-'+r.mdds[3].toFixed(1)+'%').padEnd(10)+
      '│'+String(r.trans[0]).padEnd(11)+String(r.trans[3]).padEnd(11)
    );
    r.rets.forEach((v,i)=>totals[i]*=(1+v/100));
    totBnh *= (1+r.bnh/100);
  }

  console.log('-'.repeat(W));
  const cumRets = totals.map(t=>(t-1)*100), cumBnh=(totBnh-1)*100;
  const bestCum = Math.max(...cumRets);
  console.log(
    '  누적   '+
    cumRets.map((v,i)=>((v===bestCum?'★':' ')+f(v)).padEnd(i===0?13:14)).join('')+
    '│'+f(cumBnh)
  );
  console.log('='.repeat(W));

  // ── 구간별 요약 ────────────────────────────────────────────────
  const periods = [
    { label: '강한 하락 (2011,18,22)', years: [2011,2018,2022] },
    { label: '강한 상승 (2013,17,23)', years: [2013,2017,2023] },
    { label: '학습 기간 (2022~2024)',  years: [2022,2023,2024] },
    { label: '검증 기간 (2025)',       years: [2025] },
    { label: '전체 (2010~현재)',       years: [] },
  ];

  console.log('\n구간별 요약:');
  const pHdr = ['구간','기본','최소보유','SMA50','둘다','B&H','승자'];
  console.log('  '+pHdr.map((s,i)=>s.padEnd([24,10,10,10,10,10,12][i])).join(''));
  console.log('  '+'-'.repeat(88));

  for (const p of periods) {
    const pr = p.years.length > 0 ? rows.filter(r=>p.years.includes(r.year)) : rows;
    if (!pr.length) continue;
    const acc = variants.map(()=>1);
    let ab = 1;
    for (const r of pr) { r.rets.forEach((v,i)=>acc[i]*=(1+v/100)); ab*=(1+r.bnh/100); }
    const cr = acc.map(a=>(a-1)*100), cb=(ab-1)*100;
    const allRets = [...cr, cb];
    const best = Math.max(...allRets);
    const winner = cr[3]===best?'★둘다':cr[0]===best?'★기본':cb===best?'B&H':'기타';
    console.log(
      '  '+p.label.padEnd(24)+
      cr.map(v=>f(v).padEnd(10)).join('')+
      f(cb).padEnd(10)+winner
    );
  }

  // ── 연도별 최고 전략 ─────────────────────────────────────────────
  console.log('\n연도별 최고 전략:');
  const wins = variants.map(()=>0), bnhWins={n:0};
  for (const r of rows) {
    if (r.rets.length<4) continue;
    const all = [...r.rets, r.bnh];
    const best = Math.max(...all);
    const idx = all.indexOf(best);
    if (idx < 4) wins[idx]++; else bnhWins.n++;
  }
  variants.forEach((v,i)=>console.log(`  ${v.label.padEnd(18)}: ${wins[i]}년`));
  console.log(`  ${'B&H'.padEnd(18)}: ${bnhWins.n}년`);
  console.log(`  총 ${rows.length}년`);

  // ── 최종 권장 (둘다 버전) 핵심 지표 ──────────────────────────────
  console.log('\n─── 최종 권장 (+둘다) vs 기본 하이브리드 ───');
  const downYears = [2011,2018,2022];
  const bullYears = [2013,2017,2019,2021,2023];
  for (const [label, years] of [[`하락장 (${downYears.join(',')})`,downYears],[`상승장 (${bullYears.join(',')})`,bullYears]] as [string,number[]][]) {
    const pr = rows.filter(r=>years.includes(r.year));
    let a0=1,a3=1,ab=1;
    for (const r of pr){a0*=(1+r.rets[0]/100);a3*=(1+r.rets[3]/100);ab*=(1+r.bnh/100);}
    console.log(`  ${label}: 기본 ${f((a0-1)*100).padEnd(9)} → 둘다 ${f((a3-1)*100).padEnd(9)} | B&H ${f((ab-1)*100)}`);
  }
}

main().catch(console.error);
