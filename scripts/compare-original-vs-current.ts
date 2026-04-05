/**
 * 원본 전략 vs 현재 구현 비교 백테스트
 * npx tsx --tsconfig tsconfig.json scripts/compare-original-vs-current.ts
 *
 * 원본: buyTarget 양수 (종가 ≤ 전일종가 × 1.03 → 매수)
 * 현재: buyTarget 음수 (종가 < 전일종가 × 0.96 → 매수)
 */

// ============================
// 타입
// ============================
interface MarketData { date: string; price: number; }
interface DivisionPortfolio {
  divisionNumber: number; status: 'EMPTY' | 'HOLDING';
  cash: number; holdings: number; avgPrice: number;
  buyDate: string; totalCost: number; currentValue: number;
}
interface DivisionAction {
  divisionNumber: number; action: 'BUY' | 'SELL' | 'STOP_LOSS';
  quantity: number; price: number; amount: number;
  commission: number; profit?: number;
}
interface ModeConfig { sellTarget: number; buyTarget: number; holdingDays: number; }

// ============================
// 설정
// ============================
const FEES = { commission: 0.00044, secFee: 0.0000278 };
const getFeeRate = () => FEES.commission + FEES.secFee;
const MIN_CASH = 100;

// 원본 파라미터 (알고리C 구글 시트)
const ORIGINAL_CONFIGS: Record<'safe' | 'aggressive', ModeConfig> = {
  safe:       { sellTarget: 0.002, buyTarget: +0.03, holdingDays: 30 },  // +3% 이하면 매수
  aggressive: { sellTarget: 0.025, buyTarget: +0.05, holdingDays: 7  },  // +5% 이하면 매수
};

// 현재 구현 파라미터 (tradingConfig.ts v3)
const CURRENT_CONFIGS: Record<'safe' | 'aggressive', ModeConfig> = {
  safe:       { sellTarget: 0.008, buyTarget: -0.04, holdingDays: 30 },  // -4% 이상 하락해야 매수
  aggressive: { sellTarget: 0.060, buyTarget: -0.05, holdingDays: 10 },  // -5% 이상 하락해야 매수
};

// ============================
// 유틸
// ============================
function calcTradingDays(s: string, e: string): number {
  const sp = s.split('-').map(Number), ep = e.split('-').map(Number);
  const su = Date.UTC(sp[0],sp[1]-1,sp[2]), eu = Date.UTC(ep[0],ep[1]-1,ep[2]);
  if (su > eu) return 0;
  const total = Math.floor((eu-su)/86400000)+1;
  const fw = Math.floor(total/7);
  let td = fw*5;
  const dow = new Date(su).getUTCDay();
  const rem = total%7;
  for (let i=0;i<rem;i++) { const d=(dow+i)%7; if(d!==0&&d!==6) td++; }
  return td;
}

// ============================
// 주간 RSI 모드 판별 (backtest-report.ts 동일 로직)
// ============================
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime()-y.getTime())/86400000)+1)/7);
}

function buildModeMap(priceData: MarketData[]): Map<string, 'safe' | 'aggressive'> {
  const weeks: Record<string, MarketData[]> = {};
  for (const d of priceData) {
    const dt = new Date(d.date);
    const k = `${dt.getFullYear()}-W${String(getWeekNumber(dt)).padStart(2,'0')}`;
    (weeks[k] ??= []).push(d);
  }
  const weekly = Object.keys(weeks).sort().map(k => {
    const wd = weeks[k];
    return wd.find(d => new Date(d.date).getDay() === 5) ?? wd[wd.length-1];
  });

  const period = 14;
  const prices = weekly.map(d => d.price);
  const rsi: (number|null)[] = new Array(prices.length).fill(null);
  let ag = 0, al = 0;
  for (let i=1;i<=period;i++) {
    const ch = prices[i]-prices[i-1];
    if (ch>0) ag+=ch; else al+=Math.abs(ch);
  }
  ag/=period; al/=period;
  rsi[period] = al===0 ? 100 : 100-100/(1+ag/al);
  for (let i=period+1;i<prices.length;i++) {
    const ch = prices[i]-prices[i-1];
    ag=(ag*(period-1)+(ch>0?ch:0))/period;
    al=(al*(period-1)+(ch<0?Math.abs(ch):0))/period;
    rsi[i] = al===0 ? 100 : 100-100/(1+ag/al);
  }

  // (date → rsi, prevRsi) 매핑
  const weekMap = new Map(weekly.map((w,i) => [w.date, { rsi:rsi[i], prev:i>0?rsi[i-1]:null }]));

  let mode: 'safe'|'aggressive' = 'safe';
  const result = new Map<string,'safe'|'aggressive'>();

  for (const d of priceData) {
    const w = weekMap.get(d.date);
    if (w && w.rsi !== null && w.prev !== null) {
      const curr = w.rsi, prev = w.prev;
      const rising = curr > prev, falling = curr < prev;
      if (falling || (prev>=50 && curr<50) || curr>65) {
        mode = 'safe';
      } else if (rising || (prev<50 && curr>=50) || (curr<35 && rising)) {
        mode = 'aggressive';
      }
    }
    result.set(d.date, mode);
  }
  return result;
}

// ============================
// 백테스트 엔진
// ============================
function runBacktest(
  data: MarketData[],
  config: { divisions: number; initialCapital: number; rebalancePeriod: number },
  modeConfigs: Record<'safe'|'aggressive', ModeConfig>,
  modeMap: Map<string,'safe'|'aggressive'>
): { finalAssets: number; returnRate: number; maxDD: number; winRate: number; tradeCount: number; stopLossCount: number; buyDays: number; totalDays: number } {
  const IC = config.initialCapital;
  const divAmt = IC / config.divisions;

  // 초기화
  let divs: DivisionPortfolio[] = Array.from({length: config.divisions}, (_,i) => ({
    divisionNumber: i+1, status: 'EMPTY' as const, cash: divAmt,
    holdings: 0, avgPrice: 0, buyDate: '', totalCost: 0, currentValue: 0
  }));
  let nextDivIdx = 0;

  let maxAssets = IC;
  let maxDD = 0;
  let wins = 0, losses = 0, stopLosses = 0;
  let buyDays = 0;

  for (let i=0; i<data.length; i++) {
    const d = data[i];
    const prevClose = i>0 ? data[i-1].price : null;
    const close = d.price;
    const mode = modeMap.get(d.date) ?? 'safe';
    const cfg = modeConfigs[mode];

    // 재분할
    const isRebal = i>0 && i % config.rebalancePeriod === 0;
    if (isRebal) {
      const totalCash = divs.reduce((s,dv)=>s+dv.cash,0);
      const totalStock = divs.reduce((s,dv)=>s+dv.holdings*close,0);
      const total = totalCash+totalStock;
      const target = total/config.divisions;
      const needs = divs.map(dv => dv.status==='HOLDING' ? Math.max(0,target-dv.holdings*close) : 0);
      const holdNeed = needs.reduce((s,n)=>s+n,0);
      const scale = holdNeed>0 ? Math.min(1,totalCash/holdNeed) : 1;
      const used = needs.reduce((s,n)=>s+n*scale,0);
      const rem = totalCash-used;
      const emptyN = divs.filter(dv=>dv.status==='EMPTY').length;
      const cpe = emptyN>0 ? rem/emptyN : 0;
      divs = divs.map((dv,idx) => {
        if (dv.status==='HOLDING') return {...dv, cash:needs[idx]*scale};
        return {...dv, cash:cpe, holdings:0, avgPrice:0, buyDate:'', totalCost:0, currentValue:0, status:'EMPTY' as const};
      });
    }

    // 상태 업데이트
    divs = divs.map(dv => ({
      ...dv,
      currentValue: dv.status==='HOLDING' ? dv.holdings*close : 0
    }));

    // 다음 EMPTY 분할 찾기
    for (let k=0;k<divs.length;k++) {
      const idx=(nextDivIdx+k)%divs.length;
      if (divs[idx].status==='EMPTY') { nextDivIdx=idx; break; }
    }

    let hasBought = false;
    const actions: DivisionAction[] = [];

    // 매도/손절 체크
    for (let j=0;j<divs.length;j++) {
      const dv = divs[j];
      if (dv.status!=='HOLDING'||!dv.holdings) continue;
      const td = dv.buyDate ? calcTradingDays(dv.buyDate, d.date) : 0;

      if (td >= cfg.holdingDays) {
        const amount = dv.holdings*close;
        const comm = amount*getFeeRate();
        const profit = amount-dv.totalCost-comm;
        actions.push({divisionNumber:dv.divisionNumber, action:'STOP_LOSS', quantity:dv.holdings, price:close, amount, commission:comm, profit});
        stopLosses++;
        losses++;
      } else {
        const sellLimit = dv.avgPrice*(1+cfg.sellTarget);
        if (close >= sellLimit) {
          const amount = dv.holdings*sellLimit;
          const comm = amount*getFeeRate();
          const profit = amount-dv.totalCost-comm;
          actions.push({divisionNumber:dv.divisionNumber, action:'SELL', quantity:dv.holdings, price:sellLimit, amount, commission:comm, profit});
          wins++;
        }
      }
    }

    // 매수 체크
    if (prevClose !== null) {
      const chg = (close-prevClose)/prevClose;
      const dv = divs[nextDivIdx];
      if (dv.status==='EMPTY' && dv.cash>=MIN_CASH && chg <= cfg.buyTarget) {
        const qty = Math.floor(dv.cash/(close*(1+getFeeRate())));
        if (qty > 0) {
          const amount = qty*close;
          const comm = amount*getFeeRate();
          actions.push({divisionNumber:dv.divisionNumber, action:'BUY', quantity:qty, price:close, amount, commission:comm});
          hasBought = true;
          buyDays++;
        }
      }
    }

    // 퉁치기
    const buyQty = actions.filter(a=>a.action==='BUY').reduce((s,a)=>s+a.quantity,0);
    const sellQty = actions.filter(a=>a.action!=='BUY').reduce((s,a)=>s+a.quantity,0);
    const netted = Math.min(buyQty, sellQty);
    const bFactor = buyQty>0 ? (buyQty-netted)/buyQty : 1;
    const sFactor = sellQty>0 ? (sellQty-netted)/sellQty : 1;

    // 거래 실행
    for (const act of actions) {
      const idx = divs.findIndex(dv=>dv.divisionNumber===act.divisionNumber);
      if (idx<0) continue;
      if (act.action==='BUY') {
        const comm = act.commission*bFactor;
        divs[idx] = {...divs[idx], status:'HOLDING', cash:divs[idx].cash-act.amount-comm,
          holdings:act.quantity, avgPrice:act.price, buyDate:d.date, totalCost:act.amount+comm};
        nextDivIdx = (nextDivIdx+1)%config.divisions;
      } else {
        const comm = act.commission*sFactor;
        divs[idx] = {...divs[idx], status:'EMPTY', cash:divs[idx].cash+act.amount-comm,
          holdings:0, avgPrice:0, buyDate:'', totalCost:0};
      }
    }

    const totalAssets = divs.reduce((s,dv)=>s+dv.cash+dv.currentValue,0);
    if (totalAssets > maxAssets) maxAssets = totalAssets;
    const dd = maxAssets>0 ? ((maxAssets-totalAssets)/maxAssets)*100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  const finalAssets = divs.reduce((s,dv)=>s+dv.cash+dv.currentValue,0);
  const returnRate = ((finalAssets-IC)/IC)*100;
  const tradeCount = wins+losses;
  const winRate = tradeCount>0 ? (wins/tradeCount)*100 : 0;

  return { finalAssets, returnRate, maxDD, winRate, tradeCount, stopLossCount:stopLosses, buyDays, totalDays:data.length };
}

// ============================
// Yahoo Finance 데이터
// ============================
async function fetchByPeriod(startDate: string, endDate: string): Promise<MarketData[]> {
  const start = Math.floor(new Date(startDate).getTime()/1000);
  const end = Math.floor(new Date(endDate).getTime()/1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/SOXL?period1=${start}&period2=${end}&interval=1d`;
  const res = await fetch(url, { headers: {'User-Agent':'Mozilla/5.0'} });
  if (!res.ok) throw new Error(`Yahoo Finance ${res.status}`);
  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error('데이터 없음');
  const ts: number[] = result.timestamp ?? [];
  const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
  return ts.map((t,i) => ({
    date: new Date(t*1000).toISOString().split('T')[0],
    price: Number((closes[i]||0).toFixed(2))
  })).filter(d=>d.price>0);
}

// ============================
// 메인
// ============================
async function main() {
  console.log('\n=== 원본 전략 vs 현재 구현 비교 백테스트 ===\n');
  console.log('원본 (알고리C): safe +3%/0.2%/30일 | aggr +5%/2.5%/7일 | 7분할');
  console.log('현재 (v3):      safe -4%/0.8%/30일 | aggr -5%/6.0%/10일 | 10분할');
  console.log('(매수점 +: 전일 대비 N% 이상 오르면 매수 안 함 / -: N% 이상 하락해야 매수)\n');

  const periods = [
    { label: '2022 폭락장',   start: '2022-01-01', end: '2022-12-31' },
    { label: '2023 강한상승', start: '2023-01-01', end: '2023-12-31' },
    { label: '2024 박스권',   start: '2024-01-01', end: '2024-12-31' },
    { label: '2025 전체',     start: '2025-01-01', end: '2025-12-31' },
    { label: '2022~2025 전체',start: '2022-01-01', end: '2025-12-31' },
  ];

  const IC = 10000;
  const RP = 10; // 재분할 주기

  for (const period of periods) {
    process.stdout.write(`[${period.label}] 데이터 로드 중...`);
    let data: MarketData[];
    try {
      data = await fetchByPeriod(period.start, period.end);
    } catch (e) {
      console.log(' 실패:', e);
      continue;
    }
    if (data.length < 20) { console.log(' 데이터 부족'); continue; }

    // SOXL B&H
    const bh = ((data[data.length-1].price / data[0].price) - 1) * 100;

    // RSI 모드 맵 (원본 2모드, 현재와 동일한 2모드 base로 비교)
    const modeMap2 = buildModeMap(data);

    // 원본 전략 (7분할)
    const orig = runBacktest(data, {divisions:7, initialCapital:IC, rebalancePeriod:RP}, ORIGINAL_CONFIGS, modeMap2);

    // 현재 전략 (10분할)
    const curr = runBacktest(data, {divisions:10, initialCapital:IC, rebalancePeriod:RP}, CURRENT_CONFIGS, modeMap2);

    // 공정 비교: 동일 7분할로 현재 전략
    const currSame = runBacktest(data, {divisions:7, initialCapital:IC, rebalancePeriod:RP}, CURRENT_CONFIGS, modeMap2);

    console.log(` 완료 (${data.length}거래일)\n`);

    const fmt = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
    const fmtN = (n: number) => n.toFixed(0);

    console.log(`  기간: ${period.start} ~ ${data[data.length-1].date}`);
    console.log(`  SOXL B&H: ${fmt(bh)}`);
    console.log(`  ${'전략'.padEnd(22)} ${'수익률'.padStart(8)} ${'MDD'.padStart(8)} ${'승률'.padStart(8)} ${'거래수'.padStart(7)} ${'손절수'.padStart(7)} ${'매수일수'.padStart(9)}`);
    console.log(`  ${'─'.repeat(75)}`);

    const rows = [
      { name: '원본 (7분할)',          r: orig },
      { name: '현재 v3 (10분할)',       r: curr },
      { name: '현재 v3 (7분할, 동일)', r: currSame },
    ];

    for (const row of rows) {
      const { returnRate: ret, maxDD: dd, winRate: wr, tradeCount: tc, stopLossCount: sl, buyDays: bd, totalDays: td } = row.r;
      const buyRate = td > 0 ? ((bd/td)*100).toFixed(0)+'%' : '-';
      console.log(`  ${row.name.padEnd(22)} ${fmt(ret).padStart(8)} ${('-'+dd.toFixed(1)+'%').padStart(8)} ${(wr.toFixed(0)+'%').padStart(8)} ${fmtN(tc).padStart(7)} ${fmtN(sl).padStart(7)} ${(bd+'일/'+buyRate).padStart(9)}`);
    }
    console.log();
  }

  console.log('=== 파라미터 요약 ===\n');
  console.log('                       safe 매수점   safe 매도목표   공세 매수점   공세 매도목표   공세 보유기간');
  console.log(`원본 (알고리C)            +3.0%          0.2%         +5.0%          2.5%          7일`);
  console.log(`현재 v3                   -4.0%          0.8%         -5.0%          6.0%         10일`);
  console.log();
  console.log('매수점 해석:');
  console.log('  원본 +3%: 전일 대비 +3% 이내 상승 또는 모든 하락일 → 매수 (매우 자주)');
  console.log('  현재 -4%: 전일 대비 -4% 이상 하락일만 → 매수 (선택적)');
}

main().catch(console.error);
