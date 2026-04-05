/**
 * 동파법 연도별 백테스팅 (2010~현재)
 * npx tsx --tsconfig tsconfig.json scripts/yearly.ts
 *
 * 최적화 v2 파라미터 적용:
 *   div=5, rp=20
 *   safe: buy=-4%, sell=+0.8%, hold=30일
 *   aggr: buy=-5%, sell=+10%, hold=10일
 *   bull: buy=-1%, sell=+10%, hold=45일
 */

// ============================
// 타입 정의 (optimize.ts 공유)
// ============================
interface MarketData {
  date: string; price: number; change: number; changePercent: number;
  volume: number; high: number; low: number; open: number;
}
interface DivisionPortfolio {
  divisionName: string; divisionNumber: number; status: 'EMPTY' | 'HOLDING';
  cash: number; holdings: number; avgPrice: number; buyDate: string;
  buyPrice: number; totalCost: number; currentValue: number;
  unrealizedPL: number; unrealizedPLRate: number;
  buyLimitPrice: number; sellLimitPrice: number; tradingDaysHeld: number;
}
interface DivisionAction {
  divisionName: string; divisionNumber: number;
  action: 'BUY' | 'SELL' | 'STOP_LOSS' | 'HOLD';
  quantity: number; price: number; limitPrice: number;
  amount: number; commission: number;
  profit?: number; profitRate?: number; tradingDaysHeld?: number; reason: string;
}
interface DailyTradeRecord {
  date: string; closePrice: number; prevClosePrice: number; changeRate: number;
  mode: string; divisionActions: DivisionAction[]; divisionPortfolios: DivisionPortfolio[];
  totalBuyQuantity: number; totalSellQuantity: number; netQuantity: number;
  isNetted: boolean; actualTradeQuantity: number; actualTradeType: 'BUY' | 'SELL' | 'NONE';
  savedCommission: number; dailyRealizedPL: number;
  totalCash: number; totalHoldings: number; totalValue: number;
  totalAssets: number; returnRate: number;
  isRebalanceDay: boolean; rebalanceAmount?: number;
}

// ============================
// 설정
// ============================
const FEES = { commission: 0.00044, secFee: 0.0000278 };
const getTotalFeeRate = () => FEES.commission + FEES.secFee;
const MIN_CASH = 100;
const IC = 10000;

interface ModeConfig { sellTarget: number; buyTarget: number; holdingDays: number; }
type ModeKey = 'safe' | 'aggressive' | 'bull' | 'cash';

// 최적화 v3 파라미터 (하락/폭락/보합장 특화)
const BEST_MODE_CONFIGS: Record<'safe' | 'aggressive' | 'bull', ModeConfig> = {
  safe:       { sellTarget: 0.008, buyTarget: -0.04, holdingDays: 30 },
  aggressive: { sellTarget: 0.06,  buyTarget: -0.05, holdingDays: 10 },
  bull:       { sellTarget: 0.12,  buyTarget: -0.03, holdingDays: 45 },
};
const BEST_DIV = 5;
const BEST_RP  = 20;

// ============================
// 유틸
// ============================
function calculateTradingDays(startDate: string, endDate: string): number {
  const sp = startDate.split('-').map(Number);
  const ep = endDate.split('-').map(Number);
  const s = Date.UTC(sp[0], sp[1]-1, sp[2]);
  const e = Date.UTC(ep[0], ep[1]-1, ep[2]);
  if (s > e) return 0;
  const totalDays = Math.floor((e - s) / 86400000) + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  let td = fullWeeks * 5;
  const startDow = new Date(s).getUTCDay();
  const rem = totalDays % 7;
  for (let i = 0; i < rem; i++) {
    const dow = (startDow + i) % 7;
    if (dow !== 0 && dow !== 6) td++;
  }
  return td;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getWeeklyData(priceData: MarketData[]): MarketData[] {
  const weeks: Record<string, MarketData[]> = {};
  for (const d of priceData) {
    const date = new Date(d.date);
    const key = `${date.getFullYear()}-W${String(getWeekNumber(date)).padStart(2,'0')}`;
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(d);
  }
  return Object.keys(weeks).sort().map(k => {
    const wd = weeks[k];
    return wd.find(d => new Date(d.date).getDay() === 5) ?? wd[wd.length - 1];
  });
}

function enrichWithMode(priceData: MarketData[]): (MarketData & { mode: ModeKey })[] {
  const weekly = getWeeklyData(priceData);
  const period = 14;
  if (weekly.length < period + 1) return priceData.map(d => ({ ...d, mode: 'safe' as ModeKey }));

  const prices = weekly.map(d => d.price);
  const rsiValues: (number | null)[] = new Array(prices.length).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = prices[i] - prices[i-1];
    if (ch > 0) avgGain += ch; else avgLoss += Math.abs(ch);
  }
  avgGain /= period; avgLoss /= period;
  rsiValues[period] = avgLoss === 0 ? 100 : 100 - 100/(1+avgGain/avgLoss);
  for (let i = period+1; i < prices.length; i++) {
    const ch = prices[i] - prices[i-1];
    avgGain = (avgGain*(period-1) + (ch>0?ch:0)) / period;
    avgLoss = (avgLoss*(period-1) + (ch<0?Math.abs(ch):0)) / period;
    rsiValues[i] = avgLoss === 0 ? 100 : 100 - 100/(1+avgGain/avgLoss);
  }

  const weeklyWithRSI = weekly.map((w, i) => ({ date: w.date, rsi: rsiValues[i], prevRSI: i > 0 ? rsiValues[i-1] : null }));
  const weeklyRSIMap = new Map(weeklyWithRSI.map(w => [w.date, w]));
  let lastMode: ModeKey = 'safe';

  return priceData.map(d => {
    const w = weeklyRSIMap.get(d.date);
    if (w && w.rsi !== null && w.prevRSI !== null) {
      const curr = w.rsi, prev = w.prevRSI;
      const rising = curr > prev, falling = curr < prev;
      if (falling && curr < 40)                              lastMode = 'cash';       // 하락장
      else if (falling || (prev >= 50 && curr < 50) || curr > 65) lastMode = 'safe';
      else if (curr >= 55 && curr <= 65 && rising)           lastMode = 'bull';
      else if (rising || (prev < 50 && curr >= 50))          lastMode = 'aggressive';
    }
    return { ...d, mode: lastMode };
  });
}

// ============================
// 미니 Engine (optimize.ts와 동일)
// ============================
class Engine {
  private cfg: { initialCapital: number; divisions: number; rebalancePeriod: number };
  private modeCfgs: Record<'safe' | 'aggressive' | 'bull', ModeConfig>;
  private nextIdx = 0;
  private activeMode: ModeKey = 'safe';

  constructor(cfg: { initialCapital: number; divisions: number; rebalancePeriod: number }, modeCfgs: Record<'safe' | 'aggressive' | 'bull', ModeConfig>) {
    this.cfg = cfg; this.modeCfgs = modeCfgs;
  }

  // cash 모드는 safe 설정 사용 (매도 기준 계산용)
  private mc(): ModeConfig {
    const m = this.activeMode === 'cash' ? 'safe' : this.activeMode;
    return this.modeCfgs[m];
  }

  private initDivs(): DivisionPortfolio[] {
    this.nextIdx = 0;
    const amt = this.cfg.initialCapital / this.cfg.divisions;
    return Array.from({ length: this.cfg.divisions }, (_, i) => ({
      divisionName: `분할${i+1}`, divisionNumber: i+1,
      status: 'EMPTY' as const, cash: amt, holdings: 0,
      avgPrice: 0, buyDate: '', buyPrice: 0, totalCost: 0,
      currentValue: 0, unrealizedPL: 0, unrealizedPLRate: 0,
      buyLimitPrice: 0, sellLimitPrice: 0, tradingDaysHeld: 0
    }));
  }

  private rebalance(divs: DivisionPortfolio[], price: number): DivisionPortfolio[] {
    const tc = divs.reduce((s,d)=>s+d.cash,0);
    const ts = divs.reduce((s,d)=>s+d.holdings*price,0);
    const target = (tc+ts) / this.cfg.divisions;
    let need = 0;
    const needs = divs.map(d => { if (d.status!=='HOLDING') return 0; const n=Math.max(0,target-d.holdings*price); need+=n; return n; });
    const scale = need>0 ? Math.min(1,tc/need) : 1;
    const used = needs.reduce((s,n)=>s+n*scale,0);
    const rem = tc-used;
    const ec = divs.filter(d=>d.status==='EMPTY').length;
    const cpe = ec>0 ? rem/ec : 0;
    return divs.map((d,i) => d.status==='HOLDING'
      ? { ...d, cash: needs[i]*scale }
      : { ...d, cash:cpe, holdings:0, avgPrice:0, buyDate:'', buyPrice:0, totalCost:0, currentValue:0, unrealizedPL:0, unrealizedPLRate:0, buyLimitPrice:0, sellLimitPrice:0, tradingDaysHeld:0, status:'EMPTY' as const }
    );
  }

  private updateStatus(divs: DivisionPortfolio[], price: number, date: string): DivisionPortfolio[] {
    const c = this.mc();
    return divs.map(d => {
      if (d.status==='EMPTY') return { ...d, buyLimitPrice:price*(1+c.buyTarget), sellLimitPrice:0, tradingDaysHeld:0, currentValue:0, unrealizedPL:0, unrealizedPLRate:0 };
      const cv=d.holdings*price, upl=cv-d.totalCost, uplr=d.totalCost>0?(upl/d.totalCost)*100:0;
      const td=d.buyDate?calculateTradingDays(d.buyDate,date):0;
      return { ...d, currentValue:cv, unrealizedPL:upl, unrealizedPLRate:uplr, buyLimitPrice:price*(1+c.buyTarget), sellLimitPrice:d.avgPrice*(1+c.sellTarget), tradingDaysHeld:td };
    });
  }

  private toEmpty(divs: DivisionPortfolio[]) {
    const n=divs.length;
    for (let i=0;i<n;i++) { const idx=(this.nextIdx+i)%n; if(divs[idx].status==='EMPTY'){this.nextIdx=idx;return;} }
  }

  private checkBuy(d: DivisionPortfolio, close: number, prev: number|null): DivisionAction|null {
    if (this.activeMode==='cash') return null; // 하락장 — 신규 매수 차단
    if (!prev||d.status!=='EMPTY'||d.divisionNumber!==this.nextIdx+1||d.cash<MIN_CASH) return null;
    const c=this.mc(), chg=(close-prev)/prev;
    if (chg>c.buyTarget) return null;
    const qty=Math.floor(d.cash/(close*(1+getTotalFeeRate())));
    if (!qty) return null;
    const amt=qty*close;
    return { divisionName:d.divisionName, divisionNumber:d.divisionNumber, action:'BUY', quantity:qty, price:close, limitPrice:prev*(1+c.buyTarget), amount:amt, commission:amt*getTotalFeeRate(), reason:`매수 ${(chg*100).toFixed(2)}%` };
  }

  private checkCashExit(d: DivisionPortfolio, close: number, date: string): DivisionAction|null {
    if (d.status!=='HOLDING'||!d.holdings) return null;
    const td=d.buyDate?calculateTradingDays(d.buyDate,date):0;
    const amt=d.holdings*close, comm=amt*getTotalFeeRate(), profit=amt-d.totalCost-comm;
    return { divisionName:d.divisionName, divisionNumber:d.divisionNumber, action:'STOP_LOSS', quantity:d.holdings, price:close, limitPrice:close, amount:amt, commission:comm, profit, profitRate:(profit/d.totalCost)*100, tradingDaysHeld:td, reason:`하락장 청산` };
  }

  private checkSell(d: DivisionPortfolio, close: number, date: string): DivisionAction|null {
    if (d.status!=='HOLDING'||!d.holdings) return null;
    const c=this.mc(), td=d.buyDate?calculateTradingDays(d.buyDate,date):0;
    if (td>=c.holdingDays) {
      const amt=d.holdings*close, comm=amt*getTotalFeeRate(), profit=amt-d.totalCost-comm;
      return { divisionName:d.divisionName, divisionNumber:d.divisionNumber, action:'STOP_LOSS', quantity:d.holdings, price:close, limitPrice:close, amount:amt, commission:comm, profit, profitRate:(profit/d.totalCost)*100, tradingDaysHeld:td, reason:`손절 ${td}일` };
    }
    const sl=d.avgPrice*(1+c.sellTarget);
    if (close>=sl) {
      const amt=d.holdings*sl, comm=amt*getTotalFeeRate(), profit=amt-d.totalCost-comm;
      return { divisionName:d.divisionName, divisionNumber:d.divisionNumber, action:'SELL', quantity:d.holdings, price:sl, limitPrice:sl, amount:amt, commission:comm, profit, profitRate:(profit/d.totalCost)*100, tradingDaysHeld:td, reason:`목표매도` };
    }
    return null;
  }

  backtest(data: MarketData[], modesByDate: Map<string, ModeKey>): DailyTradeRecord[] {
    if (!data.length) return [];
    const records: DailyTradeRecord[] = [];
    let divs = this.initDivs();
    data.forEach((d, i) => {
      const m = modesByDate.get(d.date);
      if (m) this.activeMode = m;
      const prevClose = i>0 ? data[i-1].price : null;
      const isRebal = i>0 && i%this.cfg.rebalancePeriod===0;
      if (isRebal) divs = this.rebalance(divs, d.price);
      divs = this.updateStatus(divs, d.price, d.date);
      this.toEmpty(divs);

      type SE = { divIdx:number; signal:DivisionAction; type:'buy'|'sell' };
      const sigs: SE[] = [];
      let buyFound=false;
      for (let j=0;j<divs.length;j++) {
        const sell = this.activeMode==='cash'
          ? this.checkCashExit(divs[j],d.price,d.date)
          : this.checkSell(divs[j],d.price,d.date);
        if (sell) sigs.push({divIdx:j,signal:sell,type:'sell'});
        if (!buyFound) { const buy=this.checkBuy(divs[j],d.price,prevClose); if(buy){sigs.push({divIdx:j,signal:buy,type:'buy'});buyFound=true;} }
      }
      const bq=sigs.filter(s=>s.type==='buy').reduce((a,s)=>a+s.signal.quantity,0);
      const sq=sigs.filter(s=>s.type==='sell').reduce((a,s)=>a+s.signal.quantity,0);
      const netted=Math.min(bq,sq);
      const bf=bq>0?(bq-netted)/bq:1, sf=sq>0?(sq-netted)/sq:1;

      const actions: DivisionAction[] = [];
      let tb=0,ts=0,dpl=0;
      for (const {divIdx,signal,type} of sigs) {
        if (type==='buy') {
          const adj={...signal,commission:signal.commission*bf};
          actions.push(adj);
          divs[divIdx]={...divs[divIdx],status:'HOLDING',cash:divs[divIdx].cash-adj.amount-adj.commission,holdings:adj.quantity,avgPrice:adj.price,buyDate:d.date,buyPrice:adj.price,totalCost:adj.amount+adj.commission};
          tb+=signal.quantity; this.nextIdx=(this.nextIdx+1)%this.cfg.divisions;
        } else {
          const comm=signal.commission*sf, profit=(signal.profit??0)+(signal.commission-comm);
          const pr=divs[divIdx].totalCost>0?(profit/divs[divIdx].totalCost)*100:(signal.profitRate??0);
          const adj={...signal,commission:comm,profit,profitRate:pr};
          actions.push(adj);
          divs[divIdx]={...divs[divIdx],status:'EMPTY',cash:divs[divIdx].cash+adj.amount-adj.commission,holdings:0,avgPrice:0,buyDate:'',buyPrice:0,totalCost:0};
          ts+=signal.quantity; dpl+=profit;
        }
      }
      const tc2=divs.reduce((s,x)=>s+x.cash,0);
      const tv=divs.reduce((s,x)=>s+x.currentValue,0);
      const ta=tc2+tv;
      const nq=tb-ts;
      records.push({
        date:d.date, closePrice:d.price, prevClosePrice:prevClose??d.price,
        changeRate:prevClose?((d.price-prevClose)/prevClose)*100:0,
        mode:this.activeMode, divisionActions:actions, divisionPortfolios:divs,
        totalBuyQuantity:tb, totalSellQuantity:ts, netQuantity:nq,
        isNetted:netted>0, actualTradeQuantity:Math.abs(nq),
        actualTradeType:nq>0?'BUY':nq<0?'SELL':'NONE',
        savedCommission:netted*d.price*getTotalFeeRate()*2,
        dailyRealizedPL:dpl, totalCash:tc2, totalHoldings:divs.reduce((s,x)=>s+x.holdings,0),
        totalValue:tv, totalAssets:ta,
        returnRate:((ta-this.cfg.initialCapital)/this.cfg.initialCapital)*100,
        isRebalanceDay:isRebal, rebalanceAmount:isRebal?ta:undefined
      });
      divs=records[records.length-1].divisionPortfolios;
    });
    return records;
  }
}

// ============================
// 통계
// ============================
function calcStats(records: DailyTradeRecord[], initialCapital: number) {
  if (!records.length) return null;
  const last = records[records.length-1];
  let peak = initialCapital, mdd = 0;
  for (const r of records) {
    if (r.totalAssets > peak) peak = r.totalAssets;
    const dd = (peak - r.totalAssets) / peak * 100;
    if (dd > mdd) mdd = dd;
  }
  const sells = records.flatMap(r=>r.divisionActions).filter(a=>a.action==='SELL'||a.action==='STOP_LOSS');
  const sl = sells.filter(a=>a.action==='STOP_LOSS').length;
  const bnh = ((last.closePrice - records[0].closePrice) / records[0].closePrice) * 100;
  return {
    ret: ((last.totalAssets - initialCapital) / initialCapital) * 100,
    mdd,
    sl,
    trades: sells.length,
    bnh,
    startPrice: records[0].closePrice,
    endPrice: last.closePrice,
    startAssets: initialCapital,
    endAssets: last.totalAssets,
  };
}

// ============================
// Yahoo Finance
// ============================
async function fetchSOXL(days: number): Promise<MarketData[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/SOXL?range=${days}d&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Yahoo Finance 오류: ${res.status}`);
  const data = await res.json();
  const result = data.chart?.result?.[0];
  if (!result) throw new Error('데이터 없음');
  const timestamps: number[] = result.timestamp || [];
  const closes: number[] = result.indicators?.quote?.[0]?.close || [];
  const opens: number[] = result.indicators?.quote?.[0]?.open || [];
  const highs: number[] = result.indicators?.quote?.[0]?.high || [];
  const lows: number[] = result.indicators?.quote?.[0]?.low || [];
  const volumes: number[] = result.indicators?.quote?.[0]?.volume || [];
  return timestamps.map((ts, i) => {
    const price = Number((closes[i]||0).toFixed(2));
    const prev = i>0?(closes[i-1]||price):price;
    const change = Number((price-prev).toFixed(2));
    return {
      date: new Date(ts*1000).toISOString().split('T')[0],
      price, change,
      changePercent: Number(((change/prev)*100).toFixed(2)),
      volume: volumes[i]||0,
      high: Number((highs[i]||price).toFixed(2)),
      low: Number((lows[i]||price).toFixed(2)),
      open: Number((opens[i]||price).toFixed(2))
    };
  }).filter(d => d.price > 0);
}

// ============================
// 메인
// ============================
async function main() {
  console.log('SOXL 데이터 로드 중... (2010년부터 전체)');
  // SOXL 상장일: 2010-03-11, 약 6000거래일
  const rawData = await fetchSOXL(6000);
  const firstDate = rawData[0].date;
  const lastDate = rawData[rawData.length-1].date;
  console.log(`총 ${rawData.length}거래일 (${firstDate} ~ ${lastDate})\n`);

  // 전체 데이터로 RSI 모드 계산 (연속성 유지)
  const allWithMode = enrichWithMode(rawData);
  const allModeMap = new Map<string, ModeKey>();
  allWithMode.forEach(x => allModeMap.set(x.date, x.mode));

  // 연도 범위
  const startYear = parseInt(firstDate.split('-')[0]);
  const endYear = parseInt(lastDate.split('-')[0]);

  type YearResult = {
    year: number;
    ret: number; bnh: number; mdd: number;
    sl: number; trades: number;
    startPrice: number; endPrice: number;
    days: number;
  };

  const results: YearResult[] = [];

  // 누적 백테스트 (연도별 독립 실행)
  for (let year = startYear; year <= endYear; year++) {
    const start = `${year}-01-01`;
    const end   = `${year}-12-31`;
    const yearData = rawData.filter(d => d.date >= start && d.date <= end);
    if (yearData.length < 10) continue;

    const eng = new Engine(
      { initialCapital: IC, divisions: BEST_DIV, rebalancePeriod: BEST_RP },
      BEST_MODE_CONFIGS
    );
    const recs = eng.backtest(yearData, allModeMap);
    const s = calcStats(recs, IC);
    if (!s) continue;

    results.push({
      year,
      ret: s.ret, bnh: s.bnh, mdd: s.mdd,
      sl: s.sl, trades: s.trades,
      startPrice: s.startPrice, endPrice: s.endPrice,
      days: yearData.length,
    });
  }

  // ============================
  // 출력
  // ============================
  const W = 100;
  console.log('='.repeat(W));
  console.log('  동파법 v2 연도별 백테스팅 결과');
  console.log('  파라미터: div=5, rp=20 | safe -4%/+0.8% | aggr -5%/+10% | bull -1%/+10%/45일');
  console.log('='.repeat(W));
  console.log(
    `  ${'연도'.padEnd(6)}${'거래일'.padEnd(6)}${'동파법'.padEnd(10)}${'BnH'.padEnd(10)}${'초과수익'.padEnd(10)}${'MDD'.padEnd(10)}${'매도'.padEnd(5)}${'손절'.padEnd(5)}${'시작가'.padEnd(9)}종가`
  );
  console.log('-'.repeat(W));

  let totalRet = 1, totalBnh = 1;
  for (const r of results) {
    const fmt  = (v: number) => `${v>=0?'+':''}${v.toFixed(1)}%`;
    const excess = r.ret - r.bnh;
    const mark = r.ret > r.bnh ? '↑' : r.ret < r.bnh ? '↓' : '=';
    console.log(
      `  ${String(r.year).padEnd(6)}${String(r.days).padEnd(6)}` +
      `${fmt(r.ret).padEnd(10)}${fmt(r.bnh).padEnd(10)}` +
      `${mark}${fmt(excess).padEnd(9)}` +
      `${('-'+r.mdd.toFixed(1)+'%').padEnd(10)}` +
      `${String(r.trades).padEnd(5)}${String(r.sl).padEnd(5)}` +
      `$${r.startPrice.toFixed(2).padEnd(9)}$${r.endPrice.toFixed(2)}`
    );
    totalRet *= (1 + r.ret / 100);
    totalBnh *= (1 + r.bnh / 100);
  }

  console.log('-'.repeat(W));
  const cumRet = (totalRet - 1) * 100;
  const cumBnh = (totalBnh - 1) * 100;
  console.log(
    `  ${'누적'.padEnd(6)}${String(results.reduce((s,r)=>s+r.days,0)).padEnd(6)}` +
    `${`+${cumRet.toFixed(1)}%`.padEnd(10)}${`+${cumBnh.toFixed(1)}%`.padEnd(10)}` +
    `↑${`+${(cumRet-cumBnh).toFixed(1)}%`.padEnd(9)}`
  );
  console.log('='.repeat(W));
}

main().catch(console.error);
