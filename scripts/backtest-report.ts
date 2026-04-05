/**
 * 백테스팅 보고서 생성 스크립트
 * npx tsx --tsconfig tsconfig.json scripts/backtest-report.ts
 */

// ============================
// 타입 정의 (인라인)
// ============================
interface MarketData {
  date: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
}

interface DivisionPortfolio {
  divisionName: string;
  divisionNumber: number;
  status: 'EMPTY' | 'HOLDING';
  cash: number;
  holdings: number;
  avgPrice: number;
  buyDate: string;
  buyPrice: number;
  totalCost: number;
  currentValue: number;
  unrealizedPL: number;
  unrealizedPLRate: number;
  buyLimitPrice: number;
  sellLimitPrice: number;
  tradingDaysHeld: number;
}

interface DivisionAction {
  divisionName: string;
  divisionNumber: number;
  action: 'BUY' | 'SELL' | 'STOP_LOSS' | 'HOLD';
  quantity: number;
  price: number;
  limitPrice: number;
  amount: number;
  commission: number;
  profit?: number;
  profitRate?: number;
  tradingDaysHeld?: number;
  reason: string;
}

interface DailyTradeRecord {
  date: string;
  closePrice: number;
  prevClosePrice: number;
  changeRate: number;
  mode: string;
  divisionActions: DivisionAction[];
  divisionPortfolios: DivisionPortfolio[];
  totalBuyQuantity: number;
  totalSellQuantity: number;
  netQuantity: number;
  isNetted: boolean;
  actualTradeQuantity: number;
  actualTradeType: 'BUY' | 'SELL' | 'NONE';
  savedCommission: number;
  dailyRealizedPL: number;
  totalCash: number;
  totalHoldings: number;
  totalValue: number;
  totalAssets: number;
  returnRate: number;
  isRebalanceDay: boolean;
  rebalanceAmount?: number;
}

// ============================
// 설정
// ============================
const FEES = { commission: 0.00044, secFee: 0.0000278 };
const getTotalFeeRate = () => FEES.commission + FEES.secFee;
const MIN_CASH = 100;

interface ModeConfig {
  sellTarget: number;
  buyTarget: number;
  holdingDays: number;
}

// v3 파라미터 + bull 모드 (2026-04-04 최적화)
const MODE_CONFIGS: Record<'safe' | 'aggressive' | 'bull', ModeConfig> = {
  safe:       { sellTarget: 0.005, buyTarget: -0.03, holdingDays: 30 },
  aggressive: { sellTarget: 0.025, buyTarget: -0.05, holdingDays: 10 },
  bull:       { sellTarget: 0.005, buyTarget: -0.02, holdingDays: 15 },
};

// ============================
// 거래일 계산 (O(1))
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

// ============================
// 주간 RSI (Wilder's SMMA)
// ============================
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

function enrichDataWithWeeklyRSIMode(
  priceData: MarketData[]
): (MarketData & { mode: 'safe' | 'aggressive' | 'bull' })[] {
  const weekly = getWeeklyData(priceData);
  const period = 14;
  if (weekly.length < period + 1) {
    return priceData.map(d => ({ ...d, mode: 'safe' as const }));
  }
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

  let lastMode: 'safe' | 'aggressive' | 'bull' = 'safe';

  return priceData.map(d => {
    const weekInfo = weeklyRSIMap.get(d.date);
    if (weekInfo && weekInfo.rsi !== null && weekInfo.prevRSI !== null) {
      const curr = weekInfo.rsi;
      const prev = weekInfo.prevRSI;
      const rising = curr > prev;
      const falling = curr < prev;
      // 안전모드: 하락, 50선 하향돌파, 과매수(>65)
      if (falling || (prev >= 50 && curr < 50) || curr > 65) {
        lastMode = 'safe';
      // 강세모드: RSI 55-65 구간에서 상승 (bull, 매수 -2% 완화)
      } else if (curr >= 55 && curr <= 65 && rising) {
        lastMode = 'bull';
      // 공세모드: 그 외 상승
      } else if (rising || (prev < 50 && curr >= 50)) {
        lastMode = 'aggressive';
      }
    }
    return { ...d, mode: lastMode };
  });
}

// ============================
// DivisionEngine (인라인)
// ============================
class DivisionEngine {
  private config: { initialCapital: number; divisions: number; mode: string; rebalancePeriod: number };
  private nextDivisionIndex = 0;
  private activeMode: 'safe' | 'aggressive' | 'bull';
  private customModeConfigs?: Partial<Record<'safe'|'aggressive'|'bull', Partial<ModeConfig>>>;

  constructor(
    config: { initialCapital: number; divisions: number; mode: string; rebalancePeriod: number },
    customModeConfigs?: Partial<Record<'safe'|'aggressive'|'bull', Partial<ModeConfig>>>
  ) {
    this.config = config;
    this.activeMode = config.mode === 'aggressive' ? 'aggressive' : config.mode === 'bull' ? 'bull' : 'safe';
    this.customModeConfigs = customModeConfigs;
  }

  private getModeConfig(mode: 'safe' | 'aggressive' | 'bull'): ModeConfig {
    const base = MODE_CONFIGS[mode];
    const custom = this.customModeConfigs?.[mode];
    return custom ? { ...base, ...custom } : base;
  }

  private syncMode(date: string, modesByDate?: Map<string, 'safe'|'aggressive'|'bull'>) {
    if (this.config.mode === 'auto') {
      const m = modesByDate?.get(date);
      if (m) this.activeMode = m;
    } else {
      this.activeMode = this.config.mode as 'safe'|'aggressive'|'bull';
    }
  }

  private initializeDivisions(): DivisionPortfolio[] {
    this.nextDivisionIndex = 0;
    const amt = this.config.initialCapital / this.config.divisions;
    return Array.from({ length: this.config.divisions }, (_, i) => ({
      divisionName: `분할${i+1}`, divisionNumber: i+1,
      status: 'EMPTY' as const, cash: amt, holdings: 0,
      avgPrice: 0, buyDate: '', buyPrice: 0, totalCost: 0,
      currentValue: 0, unrealizedPL: 0, unrealizedPLRate: 0,
      buyLimitPrice: 0, sellLimitPrice: 0, tradingDaysHeld: 0
    }));
  }

  private rebalance(divs: DivisionPortfolio[], price: number): DivisionPortfolio[] {
    const totalCash = divs.reduce((s,d) => s+d.cash, 0);
    const totalStock = divs.reduce((s,d) => s+d.holdings*price, 0);
    const total = totalCash + totalStock;
    const target = total / this.config.divisions;

    let holdingNeed = 0;
    const needs = divs.map(d => {
      if (d.status !== 'HOLDING') return 0;
      const n = Math.max(0, target - d.holdings*price);
      holdingNeed += n;
      return n;
    });
    const scale = holdingNeed > 0 ? Math.min(1, totalCash/holdingNeed) : 1;
    const usedForHolding = needs.reduce((s,n) => s+n*scale, 0);
    const remaining = totalCash - usedForHolding;
    const emptyCount = divs.filter(d => d.status==='EMPTY').length;
    const cashPerEmpty = emptyCount > 0 ? remaining/emptyCount : 0;

    return divs.map((d, i) => {
      if (d.status === 'HOLDING') return { ...d, cash: needs[i]*scale };
      return { ...d, cash: cashPerEmpty, holdings: 0, avgPrice: 0, buyDate: '', buyPrice: 0, totalCost: 0, currentValue: 0, unrealizedPL: 0, unrealizedPLRate: 0, buyLimitPrice: 0, sellLimitPrice: 0, tradingDaysHeld: 0, status: 'EMPTY' as const };
    });
  }

  private updateStatus(divs: DivisionPortfolio[], price: number, date: string): DivisionPortfolio[] {
    const cfg = this.getModeConfig(this.activeMode);
    return divs.map(d => {
      if (d.status === 'EMPTY') return { ...d, buyLimitPrice: price*(1+cfg.buyTarget), sellLimitPrice:0, tradingDaysHeld:0, currentValue:0, unrealizedPL:0, unrealizedPLRate:0 };
      const cv = d.holdings*price;
      const upl = cv - d.totalCost;
      const uplr = d.totalCost > 0 ? (upl/d.totalCost)*100 : 0;
      const td = d.buyDate ? calculateTradingDays(d.buyDate, date) : 0;
      return { ...d, currentValue:cv, unrealizedPL:upl, unrealizedPLRate:uplr, buyLimitPrice:price*(1+cfg.buyTarget), sellLimitPrice:d.avgPrice*(1+cfg.sellTarget), tradingDaysHeld:td };
    });
  }

  private advanceToNextEmpty(divs: DivisionPortfolio[]) {
    const n = divs.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.nextDivisionIndex+i) % n;
      if (divs[idx].status === 'EMPTY') { this.nextDivisionIndex = idx; return; }
    }
  }

  private checkBuy(d: DivisionPortfolio, close: number, prevClose: number|null): DivisionAction|null {
    if (!prevClose) return null;
    if (d.status !== 'EMPTY') return null;
    if (d.divisionNumber !== this.nextDivisionIndex+1) return null;
    if (d.cash < MIN_CASH) return null;
    const cfg = this.getModeConfig(this.activeMode);
    const chg = (close-prevClose)/prevClose;
    if (chg > cfg.buyTarget) return null;  // buyTarget은 음수, 이 이하로 하락 시 매수
    const qty = Math.floor(d.cash / (close*(1+getTotalFeeRate())));
    if (!qty) return null;
    const amount = qty*close;
    return { divisionName:d.divisionName, divisionNumber:d.divisionNumber, action:'BUY', quantity:qty, price:close, limitPrice:prevClose*(1+cfg.buyTarget), amount, commission:amount*getTotalFeeRate(), reason:`매수 ${(chg*100).toFixed(2)}%` };
  }

  private checkSell(d: DivisionPortfolio, close: number, date: string): DivisionAction|null {
    if (d.status !== 'HOLDING' || !d.holdings) return null;
    const cfg = this.getModeConfig(this.activeMode);
    const td = d.buyDate ? calculateTradingDays(d.buyDate, date) : 0;
    if (td >= cfg.holdingDays) {
      const amount = d.holdings*close;
      const comm = amount*getTotalFeeRate();
      const profit = amount-d.totalCost-comm;
      return { divisionName:d.divisionName, divisionNumber:d.divisionNumber, action:'STOP_LOSS', quantity:d.holdings, price:close, limitPrice:close, amount, commission:comm, profit, profitRate:(profit/d.totalCost)*100, tradingDaysHeld:td, reason:`손절 ${td}일` };
    }
    const sellLimit = d.avgPrice*(1+cfg.sellTarget);
    if (close >= sellLimit) {
      const amount = d.holdings*sellLimit;
      const comm = amount*getTotalFeeRate();
      const profit = amount-d.totalCost-comm;
      return { divisionName:d.divisionName, divisionNumber:d.divisionNumber, action:'SELL', quantity:d.holdings, price:sellLimit, limitPrice:sellLimit, amount, commission:comm, profit, profitRate:(profit/d.totalCost)*100, tradingDaysHeld:td, reason:`목표매도` };
    }
    return null;
  }

  private executeBuy(d: DivisionPortfolio, a: DivisionAction, date: string): DivisionPortfolio {
    return { ...d, status:'HOLDING', cash:d.cash-a.amount-a.commission, holdings:a.quantity, avgPrice:a.price, buyDate:date, buyPrice:a.price, totalCost:a.amount+a.commission };
  }

  private executeSell(d: DivisionPortfolio, a: DivisionAction): DivisionPortfolio {
    return { ...d, status:'EMPTY', cash:d.cash+a.amount-a.commission, holdings:0, avgPrice:0, buyDate:'', buyPrice:0, totalCost:0 };
  }

  processDay(date: string, close: number, prevClose: number|null, divs: DivisionPortfolio[], dayIdx: number): DailyTradeRecord {
    const isRebal = dayIdx > 0 && dayIdx % this.config.rebalancePeriod === 0;
    let ds = [...divs];
    if (isRebal) ds = this.rebalance(ds, close);
    ds = this.updateStatus(ds, close, date);
    this.advanceToNextEmpty(ds);

    type SE = { divIdx: number; signal: DivisionAction; type: 'buy'|'sell' };
    const signals: SE[] = [];
    let buyFound = false;

    for (let i = 0; i < ds.length; i++) {
      const sell = this.checkSell(ds[i], close, date);
      if (sell) signals.push({ divIdx:i, signal:sell, type:'sell' });
      if (!buyFound) {
        const buy = this.checkBuy(ds[i], close, prevClose);
        if (buy) { signals.push({ divIdx:i, signal:buy, type:'buy' }); buyFound = true; }
      }
    }

    const buyQty = signals.filter(s=>s.type==='buy').reduce((a,s)=>a+s.signal.quantity,0);
    const sellQty = signals.filter(s=>s.type==='sell').reduce((a,s)=>a+s.signal.quantity,0);
    const netted = Math.min(buyQty, sellQty);
    const bFactor = buyQty > 0 ? (buyQty-netted)/buyQty : 1;
    const sFactor = sellQty > 0 ? (sellQty-netted)/sellQty : 1;

    const actions: DivisionAction[] = [];
    let totalBuy = 0, totalSell = 0, dailyPL = 0;

    for (const { divIdx, signal, type } of signals) {
      if (type === 'buy') {
        const comm = signal.commission * bFactor;
        const adj = { ...signal, commission: comm };
        actions.push(adj);
        ds[divIdx] = this.executeBuy(ds[divIdx], adj, date);
        totalBuy += signal.quantity;
        this.nextDivisionIndex = (this.nextDivisionIndex+1) % this.config.divisions;
      } else {
        const comm = signal.commission * sFactor;
        const profit = (signal.profit??0) + (signal.commission - comm);
        const profitRate = ds[divIdx].totalCost > 0 ? (profit/ds[divIdx].totalCost)*100 : (signal.profitRate??0);
        const adj = { ...signal, commission: comm, profit, profitRate };
        actions.push(adj);
        ds[divIdx] = this.executeSell(ds[divIdx], adj);
        totalSell += signal.quantity;
        dailyPL += profit;
      }
    }

    const totalCash = ds.reduce((s,d)=>s+d.cash,0);
    const totalHoldings = ds.reduce((s,d)=>s+d.holdings,0);
    const totalValue = ds.reduce((s,d)=>s+d.currentValue,0);
    const totalAssets = totalCash+totalValue;
    const changeRate = prevClose ? ((close-prevClose)/prevClose)*100 : 0;
    const netQ = totalBuy-totalSell;

    return {
      date, closePrice:close, prevClosePrice:prevClose??close, changeRate,
      mode:this.activeMode, divisionActions:actions, divisionPortfolios:ds,
      totalBuyQuantity:totalBuy, totalSellQuantity:totalSell, netQuantity:netQ,
      isNetted:netted>0, actualTradeQuantity:Math.abs(netQ),
      actualTradeType: netQ>0?'BUY':netQ<0?'SELL':'NONE',
      savedCommission: netted*close*getTotalFeeRate()*2,
      dailyRealizedPL:dailyPL, totalCash, totalHoldings, totalValue, totalAssets,
      returnRate:((totalAssets-this.config.initialCapital)/this.config.initialCapital)*100,
      isRebalanceDay:isRebal, rebalanceAmount:isRebal?totalAssets:undefined
    };
  }

  backtest(data: MarketData[], modesByDate?: Map<string,'safe'|'aggressive'|'bull'>): DailyTradeRecord[] {
    if (!data.length) return [];
    const records: DailyTradeRecord[] = [];
    let divs = this.initializeDivisions();
    data.forEach((d, i) => {
      this.syncMode(d.date, modesByDate);
      const prevClose = i > 0 ? data[i-1].price : null;
      const rec = this.processDay(d.date, d.price, prevClose, divs, i);
      records.push(rec);
      divs = rec.divisionPortfolios;
    });
    return records;
  }
}

// ============================
// Yahoo Finance 데이터 직접 호출
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
    const price = Number((closes[i] || 0).toFixed(2));
    const prev = i > 0 ? (closes[i-1] || price) : price;
    const change = Number((price - prev).toFixed(2));
    return {
      date: new Date(ts * 1000).toISOString().split('T')[0],
      price, change,
      changePercent: Number(((change/prev)*100).toFixed(2)),
      volume: volumes[i] || 0,
      high: Number((highs[i] || price).toFixed(2)),
      low: Number((lows[i] || price).toFixed(2)),
      open: Number((opens[i] || price).toFixed(2)),
    };
  }).filter(d => d.price > 0);
}

// ============================
// 통계 계산
// ============================
function calcStats(records: DailyTradeRecord[], initialCapital: number) {
  if (!records.length) return null;
  const last = records[records.length - 1];
  const finalAssets = last.totalAssets;
  const totalReturn = ((finalAssets - initialCapital) / initialCapital) * 100;

  // MDD
  let peak = initialCapital, maxDrawdown = 0;
  for (const r of records) {
    if (r.totalAssets > peak) peak = r.totalAssets;
    const dd = (peak - r.totalAssets) / peak * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // 거래 통계
  const allActions = records.flatMap(r => r.divisionActions);
  const sells = allActions.filter(a => a.action === 'SELL' || a.action === 'STOP_LOSS');
  const wins = sells.filter(a => (a.profit??0) > 0);
  const losses = sells.filter(a => (a.profit??0) <= 0);
  const buys = allActions.filter(a => a.action === 'BUY');
  const stopLosses = allActions.filter(a => a.action === 'STOP_LOSS');
  const totalComm = allActions.reduce((s,a) => s+a.commission, 0);
  const totalSaved = records.reduce((s,r) => s+r.savedCommission, 0);
  const totalProfit = sells.reduce((s,a) => s+(a.profit??0), 0);
  const avgWin = wins.length ? wins.reduce((s,a)=>s+(a.profit??0),0)/wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s,a)=>s+(a.profit??0),0)/losses.length : 0;
  const rebalDays = records.filter(r => r.isRebalanceDay).length;

  // 연환산 수익률
  const tradingDays = records.length;
  const years = tradingDays / 252;
  const annualized = years > 0 ? (Math.pow(finalAssets/initialCapital, 1/years) - 1) * 100 : 0;

  // SOXL B&H 수익률
  const bnh = ((last.closePrice - records[0].closePrice) / records[0].closePrice) * 100;

  return { finalAssets, totalReturn, maxDrawdown, annualized, bnh,
    tradeCount: sells.length, buyCount: buys.length, stopLossCount: stopLosses.length,
    winRate: sells.length ? (wins.length/sells.length)*100 : 0,
    avgWin, avgLoss, totalComm, totalSaved, totalProfit, rebalDays, tradingDays };
}

function formatUSD(v: number) { return `$${v.toFixed(2)}`; }
function formatPct(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }

// ============================
// 백테스트 시나리오 실행
// ============================
async function runScenario(
  label: string,
  allData: MarketData[],
  startDate: string,
  endDate: string,
  mode: string,
  initialCapital = 10000,
  divisions = 5,
  rebalancePeriod = 10
) {
  const data = allData.filter(d => d.date >= startDate && d.date <= endDate);
  if (data.length < 10) { console.log(`  [${label}] 데이터 부족 (${data.length}일)`); return null; }

  const dataWithMode = enrichDataWithWeeklyRSIMode(data);
  const modesByDate = new Map<string,'safe'|'aggressive'|'bull'>();
  dataWithMode.forEach(d => modesByDate.set(d.date, d.mode));

  const engine = new DivisionEngine({ initialCapital, divisions, mode, rebalancePeriod });
  const records = engine.backtest(data, mode === 'auto' ? modesByDate : undefined);
  return calcStats(records, initialCapital);
}

// ============================
// 메인
// ============================
async function main() {
  console.log('SOXL 과거 데이터 로드 중...');
  const rawData = await fetchSOXL(1500); // ~5.9년치
  console.log(`총 ${rawData.length}개 거래일 로드 완료 (${rawData[0].date} ~ ${rawData[rawData.length-1].date})\n`);

  const IC = 10000;

  const scenarios: Array<{ label: string; start: string; end: string; mode: string; desc: string }> = [
    // ── 최근 기간
    { label: '최근 1년 (AUTO)',       start: '2025-04-04', end: '2026-04-04', mode: 'auto',       desc: '최근 1년, RSI 자동 모드' },
    { label: '최근 1년 (SAFE)',       start: '2025-04-04', end: '2026-04-04', mode: 'safe',       desc: '최근 1년, 안전 모드' },
    { label: '최근 1년 (AGGR)',       start: '2025-04-04', end: '2026-04-04', mode: 'aggressive', desc: '최근 1년, 공세 모드' },

    // ── 2024년 (상승장)
    { label: '2024 전체 (AUTO)',      start: '2024-01-01', end: '2024-12-31', mode: 'auto',       desc: '2024 상승장' },
    { label: '2024 전체 (SAFE)',      start: '2024-01-01', end: '2024-12-31', mode: 'safe',       desc: '2024 상승장, 안전' },
    { label: '2024 전체 (AGGR)',      start: '2024-01-01', end: '2024-12-31', mode: 'aggressive', desc: '2024 상승장, 공세' },

    // ── 2022년 (하락장 - SOXL -84%)
    { label: '2022 전체 (AUTO)',      start: '2022-01-01', end: '2022-12-30', mode: 'auto',       desc: '2022 대폭락' },
    { label: '2022 전체 (SAFE)',      start: '2022-01-01', end: '2022-12-30', mode: 'safe',       desc: '2022 대폭락, 안전' },

    // ── 2023년 (반등장)
    { label: '2023 전체 (AUTO)',      start: '2023-01-01', end: '2023-12-29', mode: 'auto',       desc: '2023 반등' },
    { label: '2023 전체 (BULL)',      start: '2023-01-01', end: '2023-12-29', mode: 'bull',       desc: '2023 반등, 강세모드 고정' },
    { label: '2023 전체 (SAFE)',      start: '2023-01-01', end: '2023-12-29', mode: 'safe',       desc: '2023 반등, 안전모드 고정' },

    // ── 2년 (2023-2024)
    { label: '2023-2024 (AUTO)',      start: '2023-01-01', end: '2024-12-31', mode: 'auto',       desc: '2년 복합장' },

    // ── 전체 가용 기간
    { label: '전체 기간 (AUTO)',      start: rawData[0].date, end: rawData[rawData.length-1].date, mode: 'auto', desc: '전체 기간' },
  ];

  const results: Array<{ label: string; desc: string; s: ReturnType<typeof calcStats> }> = [];

  for (const sc of scenarios) {
    const s = await runScenario(sc.label, rawData, sc.start, sc.end, sc.mode, IC);
    results.push({ label: sc.label, desc: sc.desc, s });
  }

  // ============================
  // 보고서 출력
  // ============================
  const today = new Date().toISOString().split('T')[0];
  console.log('='.repeat(90));
  console.log('  동파법 SOXL 백테스팅 보고서 (v3 + bull 모드)');
  console.log(`  초기 자본: ${formatUSD(IC)}  |  5분할  |  10일 재분할`);
  console.log(`  생성일: ${today}`);
  console.log('='.repeat(90));

  for (const { label, desc, s } of results) {
    if (!s) continue;
    console.log(`\n▶ ${label}  (${desc})`);
    console.log('-'.repeat(70));
    console.log(`  최종 자산       : ${formatUSD(s.finalAssets)}  (초기 ${formatUSD(IC)})`);
    console.log(`  총 수익률       : ${formatPct(s.totalReturn)}   |  연환산: ${formatPct(s.annualized)}`);
    console.log(`  SOXL 단순보유   : ${formatPct(s.bnh)}  (동파법 대비: ${formatPct(s.totalReturn - s.bnh)})`);
    console.log(`  최대 낙폭(MDD)  : -${s.maxDrawdown.toFixed(2)}%`);
    console.log(`  거래일 / 매매수 : ${s.tradingDays}일  /  매수 ${s.buyCount}회  매도 ${s.tradeCount}회  (손절 ${s.stopLossCount}회)`);
    console.log(`  승률            : ${s.winRate.toFixed(1)}%  |  평균 수익 ${formatUSD(s.avgWin)}  |  평균 손실 ${formatUSD(s.avgLoss)}`);
    console.log(`  총 수수료       : ${formatUSD(s.totalComm)}  |  퉁치기 절감: ${formatUSD(s.totalSaved)}`);
    console.log(`  재분할 횟수     : ${s.rebalDays}회`);
  }

  // ── 분할수 비교
  console.log('\n' + '='.repeat(90));
  console.log('  [분할수 비교] 최근 1년 / AUTO 모드 / $10,000');
  console.log('='.repeat(90));
  const divComps = [3, 5, 7, 10];
  for (const div of divComps) {
    const eng = new DivisionEngine({ initialCapital: IC, divisions: div, mode: 'auto', rebalancePeriod: 10 });
    const data = rawData.filter(d => d.date >= '2025-04-04' && d.date <= '2026-04-04');
    const wm = enrichDataWithWeeklyRSIMode(data);
    const mm = new Map<string,'safe'|'aggressive'|'bull'>(); wm.forEach(d => mm.set(d.date, d.mode));
    const recs = eng.backtest(data, mm);
    const st = calcStats(recs, IC);
    if (st) console.log(`  ${div}분할: 수익률 ${formatPct(st.totalReturn)}  MDD -${st.maxDrawdown.toFixed(1)}%  매매 ${st.tradeCount}회  수수료 ${formatUSD(st.totalComm)}`);
  }

  // ── 재분할 주기 비교
  console.log('\n' + '='.repeat(90));
  console.log('  [재분할 주기 비교] 최근 1년 / AUTO 모드 / 5분할');
  console.log('='.repeat(90));
  const rebalComps = [5, 10, 15, 20, 30];
  for (const rp of rebalComps) {
    const eng = new DivisionEngine({ initialCapital: IC, divisions: 5, mode: 'auto', rebalancePeriod: rp });
    const data = rawData.filter(d => d.date >= '2025-04-04' && d.date <= '2026-04-04');
    const wm = enrichDataWithWeeklyRSIMode(data);
    const mm = new Map<string,'safe'|'aggressive'|'bull'>(); wm.forEach(d => mm.set(d.date, d.mode));
    const recs = eng.backtest(data, mm);
    const st = calcStats(recs, IC);
    if (st) console.log(`  ${String(rp).padStart(2)}일 주기: 수익률 ${formatPct(st.totalReturn)}  MDD -${st.maxDrawdown.toFixed(1)}%  재분할 ${st.rebalDays}회`);
  }

  // ── bull 모드 3차원 파라미터 탐색 (buyTarget × sellTarget × holdingDays)
  console.log('\n' + '='.repeat(90));
  console.log('  [bull 파라미터 그리드 탐색] 4개 구간 동시 평가 / AUTO / 5분할');
  console.log('  기준: 2023 상승장 수익률 내림차순, 상위 15개 교차 검증');
  console.log('='.repeat(90));

  const buyTargets  = [-0.01, -0.02, -0.03];
  const sellTargets = [0.02, 0.05, 0.08, 0.10, 0.15, 0.20, 0.25];
  const holdingDaysList = [10, 15, 20, 30, 45, 60];

  const scenarios4 = [
    { key: '2023', start: '2023-01-01', end: '2023-12-29' },
    { key: '2022', start: '2022-01-01', end: '2022-12-30' },
    { key: '2024', start: '2024-01-01', end: '2024-12-31' },
    { key: '1yr',  start: '2025-04-04', end: '2026-04-04' },
  ];

  // 데이터 및 모드맵 사전 계산
  const dataMap = new Map<string, MarketData[]>();
  const modeMap = new Map<string, Map<string,'safe'|'aggressive'|'bull'>>();
  for (const sc of scenarios4) {
    const d = rawData.filter(x => x.date >= sc.start && x.date <= sc.end);
    const wm = enrichDataWithWeeklyRSIMode(d);
    const mm = new Map<string,'safe'|'aggressive'|'bull'>(); wm.forEach(x => mm.set(x.date, x.mode));
    dataMap.set(sc.key, d);
    modeMap.set(sc.key, mm);
  }

  type GridResult = {
    buyTarget: number; sellTarget: number; holdingDays: number;
    ret2023: number; ret2022: number; ret2024: number; ret1yr: number;
    mdd2023: number; sl2023: number;
  };
  const gridResults: GridResult[] = [];

  for (const bt of buyTargets) {
    for (const st of sellTargets) {
      for (const hd of holdingDaysList) {
        const custom = { bull: { buyTarget: bt, sellTarget: st, holdingDays: hd } };
        const row: GridResult = { buyTarget: bt, sellTarget: st, holdingDays: hd, ret2023:0, ret2022:0, ret2024:0, ret1yr:0, mdd2023:0, sl2023:0 };
        for (const sc of scenarios4) {
          const eng = new DivisionEngine({ initialCapital: IC, divisions: 5, mode: 'auto', rebalancePeriod: 10 }, custom);
          const recs = eng.backtest(dataMap.get(sc.key)!, modeMap.get(sc.key));
          const s = calcStats(recs, IC);
          if (!s) continue;
          if (sc.key === '2023') { row.ret2023 = s.totalReturn; row.mdd2023 = s.maxDrawdown; row.sl2023 = s.stopLossCount; }
          if (sc.key === '2022') row.ret2022 = s.totalReturn;
          if (sc.key === '2024') row.ret2024 = s.totalReturn;
          if (sc.key === '1yr')  row.ret1yr  = s.totalReturn;
        }
        gridResults.push(row);
      }
    }
  }

  // 2023 수익률 내림차순 정렬 → 상위 20개 출력
  gridResults.sort((a, b) => b.ret2023 - a.ret2023);
  const top20 = gridResults.slice(0, 20);

  console.log(`  ${'buy'.padEnd(6)} ${'sell'.padEnd(6)} ${'hold'.padEnd(6)} ${'2023'.padEnd(9)} ${'2022'.padEnd(9)} ${'2024'.padEnd(9)} ${'1yr'.padEnd(9)} MDD(23)  손절`);
  console.log('-'.repeat(90));
  for (const r of top20) {
    const line = [
      `${(r.buyTarget*100).toFixed(0)}%`.padEnd(6),
      `+${(r.sellTarget*100).toFixed(0)}%`.padEnd(6),
      `${r.holdingDays}일`.padEnd(6),
      formatPct(r.ret2023).padEnd(9),
      formatPct(r.ret2022).padEnd(9),
      formatPct(r.ret2024).padEnd(9),
      formatPct(r.ret1yr).padEnd(9),
      `-${r.mdd2023.toFixed(1)}%`.padEnd(9),
      `${r.sl2023}회`,
    ].join(' ');
    console.log('  ' + line);
  }

  // 기준선 (현재 bull 기본값) 출력
  const baseline = gridResults.find(r => r.buyTarget === -0.02 && r.sellTarget === 0.005 && r.holdingDays === 15);
  if (!baseline) {
    // 현재 기본값이 그리드에 없으면 직접 계산
    const custom0 = { bull: { buyTarget: -0.02, sellTarget: 0.005, holdingDays: 15 } };
    const row0: GridResult = { buyTarget: -0.02, sellTarget: 0.005, holdingDays: 15, ret2023:0, ret2022:0, ret2024:0, ret1yr:0, mdd2023:0, sl2023:0 };
    for (const sc of scenarios4) {
      const eng = new DivisionEngine({ initialCapital: IC, divisions: 5, mode: 'auto', rebalancePeriod: 10 }, custom0);
      const recs = eng.backtest(dataMap.get(sc.key)!, modeMap.get(sc.key));
      const s = calcStats(recs, IC);
      if (!s) continue;
      if (sc.key === '2023') { row0.ret2023 = s.totalReturn; row0.mdd2023 = s.maxDrawdown; row0.sl2023 = s.stopLossCount; }
      if (sc.key === '2022') row0.ret2022 = s.totalReturn;
      if (sc.key === '2024') row0.ret2024 = s.totalReturn;
      if (sc.key === '1yr')  row0.ret1yr  = s.totalReturn;
    }
    console.log('\n  [현재 기본값] buy -2%  sell +0.5%  hold 15일');
    console.log(`  2023: ${formatPct(row0.ret2023)}  2022: ${formatPct(row0.ret2022)}  2024: ${formatPct(row0.ret2024)}  1yr: ${formatPct(row0.ret1yr)}`);
  }

  console.log('\n' + '='.repeat(90));
}


main().catch(console.error);
