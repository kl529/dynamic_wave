/**
 * 동파법 파라미터 최적화 스크립트
 * npx tsx --tsconfig tsconfig.json scripts/optimize.ts
 *
 * 평가 기준: 2023 상승장 / 2024 박스권 / 최근 1년 (폭락장 제외)
 * 탐색 파라미터: divisions, rebalancePeriod, safe/aggressive/bull 모드 설정
 */

// ============================
// 타입 정의
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
type ModeKey = 'safe' | 'aggressive' | 'bull';

const BASE_CONFIGS: Record<ModeKey, ModeConfig> = {
  safe:       { sellTarget: 0.005, buyTarget: -0.03, holdingDays: 30 },
  aggressive: { sellTarget: 0.025, buyTarget: -0.05, holdingDays: 10 },
  bull:       { sellTarget: 0.10,  buyTarget: -0.03, holdingDays: 30 },
};

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
      if (falling || (prev >= 50 && curr < 50) || curr > 65) lastMode = 'safe';
      else if (curr >= 55 && curr <= 65 && rising)           lastMode = 'bull';
      else if (rising || (prev < 50 && curr >= 50))          lastMode = 'aggressive';
    }
    return { ...d, mode: lastMode };
  });
}

// ============================
// 미니 DivisionEngine
// ============================
class Engine {
  private cfg: { initialCapital: number; divisions: number; rebalancePeriod: number };
  private modeCfgs: Record<ModeKey, ModeConfig>;
  private nextIdx = 0;
  private activeMode: ModeKey = 'safe';

  constructor(
    cfg: { initialCapital: number; divisions: number; rebalancePeriod: number },
    modeCfgs: Record<ModeKey, ModeConfig>
  ) { this.cfg = cfg; this.modeCfgs = modeCfgs; }

  private mc(): ModeConfig { return this.modeCfgs[this.activeMode]; }

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
    if (!prev||d.status!=='EMPTY'||d.divisionNumber!==this.nextIdx+1||d.cash<MIN_CASH) return null;
    const c=this.mc(), chg=(close-prev)/prev;
    if (chg>c.buyTarget) return null;
    const qty=Math.floor(d.cash/(close*(1+getTotalFeeRate())));
    if (!qty) return null;
    const amt=qty*close;
    return { divisionName:d.divisionName, divisionNumber:d.divisionNumber, action:'BUY', quantity:qty, price:close, limitPrice:prev*(1+c.buyTarget), amount:amt, commission:amt*getTotalFeeRate(), reason:`매수 ${(chg*100).toFixed(2)}%` };
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
        const sell=this.checkSell(divs[j],d.price,d.date);
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
function calcStats(records: DailyTradeRecord[]) {
  if (!records.length) return null;
  const last = records[records.length-1];
  let peak = IC, mdd = 0;
  for (const r of records) { if(r.totalAssets>peak) peak=r.totalAssets; const dd=(peak-r.totalAssets)/peak*100; if(dd>mdd) mdd=dd; }
  const sells = records.flatMap(r=>r.divisionActions).filter(a=>a.action==='SELL'||a.action==='STOP_LOSS');
  const sl = sells.filter(a=>a.action==='STOP_LOSS').length;
  return {
    ret: ((last.totalAssets-IC)/IC)*100,
    mdd,
    sl,
    trades: sells.length,
    bnh: ((last.closePrice-records[0].closePrice)/records[0].closePrice)*100,
  };
}

// ============================
// Yahoo Finance 데이터
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
    return { date:new Date(ts*1000).toISOString().split('T')[0], price, change, changePercent:Number(((change/prev)*100).toFixed(2)), volume:volumes[i]||0, high:Number((highs[i]||price).toFixed(2)), low:Number((lows[i]||price).toFixed(2)), open:Number((opens[i]||price).toFixed(2)) };
  }).filter(d=>d.price>0);
}

// ============================
// 메인
// ============================
async function main() {
  console.log('SOXL 데이터 로드 중...');
  const rawData = await fetchSOXL(6000); // 2011년 포함하려면 충분한 기간 필요
  console.log(`총 ${rawData.length}거래일 (${rawData[0].date} ~ ${rawData[rawData.length-1].date})\n`);

  // 평가 구간 (하락/폭락/횡보장 — 동파법 유효 구간)
  const evalScenarios = [
    { key: '2011', label: '2011 하락장', start: '2011-01-01', end: '2011-12-30' },
    { key: '2012', label: '2012 횡보장', start: '2012-01-01', end: '2012-12-31' },
    { key: '2018', label: '2018 하락장', start: '2018-01-01', end: '2018-12-31' },
    { key: '2022', label: '2022 폭락장', start: '2022-01-01', end: '2022-12-30' },
    { key: '2024', label: '2024 보합장', start: '2024-01-01', end: '2024-12-31' },
  ];

  // 데이터 사전 계산
  const dataMap = new Map<string, MarketData[]>();
  const modeMap = new Map<string, Map<string, ModeKey>>();
  for (const sc of evalScenarios) {
    const d = rawData.filter(x => x.date >= sc.start && x.date <= sc.end);
    const wm = enrichWithMode(d);
    const mm = new Map<string, ModeKey>(); wm.forEach(x => mm.set(x.date, x.mode));
    dataMap.set(sc.key, d);
    modeMap.set(sc.key, mm);
  }

  // ============================
  // 탐색 그리드 정의 (확장 v3)
  // ============================
  // v2 결과 반영:
  //   - safe_sell +0.8% 고정 유지
  //   - aggr_sell: +20%는 10거래일 내 달성 현실성 낮음 → +5~+12% 현실적 범위로 교체
  //   - bull_hold: 45일이면 충분 (45/60/90/120 동일 결과) → 45일 고정
  //   - bull_sell: +10~+15% 범위 집중
  //   - 평가 구간: 2021 대상승장 추가 (overfitting 방지)
  const grid = {
    divisions:          [5, 7, 10],
    rebalancePeriod:    [5, 10, 20],
    safe_buy:           [-0.02, -0.03, -0.04],
    safe_sell:          [0.008],                         // 고정 (+0.8%)
    safe_hold:          [20, 30, 45],                    // 횡보장 손절 타이밍
    aggr_buy:           [-0.03, -0.05, -0.07],
    aggr_sell:          [0.05, 0.06, 0.08, 0.10, 0.12], // 현실적 범위 (+5~+12%)
    bull_buy:           [-0.01, -0.02, -0.03],
    bull_sell:          [0.08, 0.10, 0.12, 0.15],
    bull_hold:          [45],                            // 45일 고정
  };

  const total = grid.divisions.length * grid.rebalancePeriod.length
    * grid.safe_buy.length * grid.safe_sell.length * grid.safe_hold.length
    * grid.aggr_buy.length * grid.aggr_sell.length
    * grid.bull_buy.length * grid.bull_sell.length * grid.bull_hold.length;

  console.log(`탐색 조합 수: ${total.toLocaleString()}개`);
  console.log('백테스팅 중...\n');

  type Row = {
    divisions: number; rebalancePeriod: number;
    safe_buy: number; safe_sell: number; safe_hold: number;
    aggr_buy: number; aggr_sell: number;
    bull_buy: number; bull_sell: number; bull_hold: number;
    ret2011: number; ret2012: number; ret2018: number; ret2022: number; ret2024: number;
    mdd2011: number; mdd2012: number; mdd2018: number; mdd2022: number; mdd2024: number;
    sl2011: number;  sl2012: number;  sl2018: number;  sl2022: number;  sl2024: number;
    avg: number;   // 5구간 평균 수익률
    min: number;   // 5구간 최솟값 (worst-case)
  };

  const allRows: Row[] = [];
  let count = 0;

  for (const div of grid.divisions)
  for (const rp  of grid.rebalancePeriod)
  for (const sb  of grid.safe_buy)
  for (const ss  of grid.safe_sell)
  for (const sh  of grid.safe_hold)
  for (const ab  of grid.aggr_buy)
  for (const as_ of grid.aggr_sell)
  for (const bb  of grid.bull_buy)
  for (const bs  of grid.bull_sell)
  for (const bh  of grid.bull_hold) {
    const modeCfgs: Record<ModeKey, ModeConfig> = {
      safe:       { buyTarget: sb, sellTarget: ss, holdingDays: sh },
      aggressive: { buyTarget: ab, sellTarget: as_, holdingDays: 10 },
      bull:       { buyTarget: bb, sellTarget: bs,  holdingDays: bh },
    };
    const row: Row = {
      divisions:div, rebalancePeriod:rp,
      safe_buy:sb, safe_sell:ss, safe_hold:sh, aggr_buy:ab, aggr_sell:as_,
      bull_buy:bb, bull_sell:bs, bull_hold:bh,
      ret2011:0, ret2012:0, ret2018:0, ret2022:0, ret2024:0,
      mdd2011:0, mdd2012:0, mdd2018:0, mdd2022:0, mdd2024:0,
      sl2011:0,  sl2012:0,  sl2018:0,  sl2022:0,  sl2024:0,
      avg:0, min:0,
    };
    for (const sc of evalScenarios) {
      const eng = new Engine({ initialCapital: IC, divisions: div, rebalancePeriod: rp }, modeCfgs);
      const recs = eng.backtest(dataMap.get(sc.key)!, modeMap.get(sc.key)!);
      const s = calcStats(recs);
      if (!s) continue;
      if (sc.key==='2011') { row.ret2011=s.ret; row.mdd2011=s.mdd; row.sl2011=s.sl; }
      if (sc.key==='2012') { row.ret2012=s.ret; row.mdd2012=s.mdd; row.sl2012=s.sl; }
      if (sc.key==='2018') { row.ret2018=s.ret; row.mdd2018=s.mdd; row.sl2018=s.sl; }
      if (sc.key==='2022') { row.ret2022=s.ret; row.mdd2022=s.mdd; row.sl2022=s.sl; }
      if (sc.key==='2024') { row.ret2024=s.ret; row.mdd2024=s.mdd; row.sl2024=s.sl; }
    }
    row.avg = (row.ret2011 + row.ret2012 + row.ret2018 + row.ret2022 + row.ret2024) / 5;
    row.min = Math.min(row.ret2011, row.ret2012, row.ret2018, row.ret2022, row.ret2024);
    allRows.push(row);
    count++;
    if (count % 500 === 0) process.stdout.write(`\r  진행: ${count.toLocaleString()} / ${total.toLocaleString()}`);
  }
  console.log(`\r  완료: ${count.toLocaleString()}개\n`);

  // ============================
  // 결과 저장 (CSV)
  // ============================
  const csvHeader = 'divisions,rebalancePeriod,safe_buy,safe_sell,safe_hold,aggr_buy,aggr_sell,bull_buy,bull_sell,bull_hold,ret2011,ret2012,ret2018,ret2022,ret2024,avg,min,mdd2011,mdd2012,mdd2018,mdd2022,mdd2024,sl2011,sl2012,sl2018,sl2022,sl2024';
  const csvRows = allRows.map(r =>
    [r.divisions,r.rebalancePeriod,r.safe_buy,r.safe_sell,r.safe_hold,r.aggr_buy,r.aggr_sell,
     r.bull_buy,r.bull_sell,r.bull_hold,
     r.ret2011.toFixed(2),r.ret2012.toFixed(2),r.ret2018.toFixed(2),r.ret2022.toFixed(2),r.ret2024.toFixed(2),
     r.avg.toFixed(2),r.min.toFixed(2),
     r.mdd2011.toFixed(2),r.mdd2012.toFixed(2),r.mdd2018.toFixed(2),r.mdd2022.toFixed(2),r.mdd2024.toFixed(2),
     r.sl2011,r.sl2012,r.sl2018,r.sl2022,r.sl2024].join(',')
  );
  const csvPath = 'docs/optimize-results-v3.csv';
  const { writeFileSync } = await import('fs');
  writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'));
  console.log(`CSV 저장: ${csvPath} (${allRows.length}행)\n`);

  // ============================
  // 상위 20개 출력 (평균 기준)
  // ============================
  function printTop(label: string, sorted: Row[], n = 20) {
    console.log('='.repeat(130));
    console.log(`  ${label}`);
    console.log('='.repeat(130));
    const h = `  ${'div'.padEnd(5)}${'rb'.padEnd(5)}${'sb'.padEnd(6)}${'ss'.padEnd(6)}${'sh'.padEnd(5)}${'ab'.padEnd(6)}${'as'.padEnd(7)}${'bb'.padEnd(6)}${'bs'.padEnd(7)}${'bh'.padEnd(5)}${'2011'.padEnd(9)}${'2012'.padEnd(9)}${'2018'.padEnd(9)}${'2022'.padEnd(9)}${'2024'.padEnd(9)}${'avg'.padEnd(9)}min`;
    console.log(h);
    console.log('-'.repeat(130));
    for (const r of sorted.slice(0, n)) {
      const fmt = (v: number) => `${v>=0?'+':''}${v.toFixed(1)}%`;
      console.log(
        `  ${String(r.divisions).padEnd(5)}${String(r.rebalancePeriod).padEnd(5)}` +
        `${(r.safe_buy*100).toFixed(0)}%`.padEnd(6) +
        `+${(r.safe_sell*100).toFixed(1)}%`.padEnd(6) +
        `${r.safe_hold}일`.padEnd(5) +
        `${(r.aggr_buy*100).toFixed(0)}%`.padEnd(6) +
        `+${(r.aggr_sell*100).toFixed(1)}%`.padEnd(7) +
        `${(r.bull_buy*100).toFixed(0)}%`.padEnd(6) +
        `+${(r.bull_sell*100).toFixed(0)}%`.padEnd(7) +
        `${r.bull_hold}일`.padEnd(5) +
        fmt(r.ret2011).padEnd(9) + fmt(r.ret2012).padEnd(9) + fmt(r.ret2018).padEnd(9) + fmt(r.ret2022).padEnd(9) + fmt(r.ret2024).padEnd(9) +
        fmt(r.avg).padEnd(9) + fmt(r.min)
      );
    }
  }

  // 정렬 1: 평균 수익률
  const byAvg = [...allRows].sort((a,b) => b.avg - a.avg);
  printTop('상위 20 — 5구간 평균 수익률 기준 (하락/횡보/폭락/보합장)', byAvg);

  // 정렬 2: 최솟값 (worst-case 기준)
  const byMin = [...allRows].sort((a,b) => b.min - a.min);
  printTop('상위 20 — 5구간 최솟값(worst-case) 기준', byMin);

  // 정렬 3: 2022 폭락장 기준
  const by2022 = [...allRows].sort((a,b) => b.ret2022 - a.ret2022);
  printTop('상위 20 — 2022 폭락장 기준', by2022);

  // 현재 기본값 비교
  console.log('\n' + '='.repeat(130));
  console.log('  [현재 코드 기준값] div=5, rp=20, safe -4%/+0.8%/30일, aggr -5%/+10%, bull -1%/+10%/45일');
  const baseModeCfgs: Record<ModeKey, ModeConfig> = BASE_CONFIGS;
  for (const sc of evalScenarios) {
    const eng = new Engine({ initialCapital: IC, divisions: 5, rebalancePeriod: 10 }, baseModeCfgs);
    const recs = eng.backtest(dataMap.get(sc.key)!, modeMap.get(sc.key)!);
    const s = calcStats(recs);
    if (s) console.log(`  ${sc.label.padEnd(12)}: ${s.ret>=0?'+':''}${s.ret.toFixed(2)}%  MDD -${s.mdd.toFixed(1)}%  손절 ${s.sl}회`);
  }
  console.log('='.repeat(130));
}

main().catch(console.error);
