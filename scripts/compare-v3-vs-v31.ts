/**
 * v3 vs v3.1 연도별 비교 백테스팅 (2010~현재)
 * npx tsx --tsconfig tsconfig.json scripts/compare-v3-vs-v31.ts
 *
 * v3  (현재): safe -4%/0.8%/30일, aggr -5%/6%/10일, bull -3%/12%/45일, div=10
 * v3.1(권장): safe -3%/2.0%/20일, aggr -5%/8%/7일,  bull -3%/12%/45일, div=10
 */

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
interface DailyRecord {
  date: string; closePrice: number; mode: string;
  divisionActions: DivisionAction[]; divisionPortfolios: DivisionPortfolio[];
  totalBuyQuantity: number; totalSellQuantity: number; netQuantity: number;
  isNetted: boolean; savedCommission: number; dailyRealizedPL: number;
  totalCash: number; totalHoldings: number; totalValue: number;
  totalAssets: number; returnRate: number; isRebalanceDay: boolean;
}

const FEES = { commission: 0.00044, secFee: 0.0000278 };
const getTotalFeeRate = () => FEES.commission + FEES.secFee;
const MIN_CASH = 100;
const IC = 10000;

interface ModeConfig { sellTarget: number; buyTarget: number; holdingDays: number; }
type ModeKey = 'safe' | 'aggressive' | 'bull' | 'cash';

// ── 파라미터 세트 ─────────────────────────────────────────
const V3: Record<'safe'|'aggressive'|'bull', ModeConfig> = {
  safe:       { sellTarget: 0.008, buyTarget: -0.04, holdingDays: 30 },
  aggressive: { sellTarget: 0.06,  buyTarget: -0.05, holdingDays: 10 },
  bull:       { sellTarget: 0.12,  buyTarget: -0.03, holdingDays: 45 },
};
const V31: Record<'safe'|'aggressive'|'bull', ModeConfig> = {
  safe:       { sellTarget: 0.02,  buyTarget: -0.03, holdingDays: 20 },
  aggressive: { sellTarget: 0.08,  buyTarget: -0.05, holdingDays: 7  },
  bull:       { sellTarget: 0.12,  buyTarget: -0.03, holdingDays: 45 },
};
const DIV = 10, RP = 10;

// ── 유틸 ─────────────────────────────────────────────────
function calcTradingDays(start: string, end: string): number {
  const s = Date.UTC(...(start.split('-').map(Number) as [number,number,number]).map((v,i)=>i===1?v-1:v) as [number,number,number]);
  const e = Date.UTC(...(end.split('-').map(Number) as [number,number,number]).map((v,i)=>i===1?v-1:v) as [number,number,number]);
  if (s > e) return 0;
  const total = Math.floor((e-s)/86400000)+1;
  const full = Math.floor(total/7);
  let td = full*5;
  const startDow = new Date(s).getUTCDay(), rem = total%7;
  for (let i=0;i<rem;i++) { const dow=(startDow+i)%7; if(dow&&dow!==6) td++; }
  return td;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const day = d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-day);
  const y = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d.getTime()-y.getTime())/86400000)+1)/7);
}

function enrichWithMode(priceData: MarketData[]): (MarketData & { mode: ModeKey })[] {
  const weeks: Record<string, MarketData[]> = {};
  for (const d of priceData) {
    const dt = new Date(d.date);
    const key = `${dt.getFullYear()}-W${String(getWeekNumber(dt)).padStart(2,'0')}`;
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(d);
  }
  const weekly = Object.keys(weeks).sort().map(k => {
    const wd = weeks[k];
    return wd.find(d => new Date(d.date).getDay()===5) ?? wd[wd.length-1];
  });

  const period = 14;
  if (weekly.length < period+1) return priceData.map(d=>({...d,mode:'safe' as ModeKey}));
  const prices = weekly.map(d=>d.price);
  const rsiValues: (number|null)[] = new Array(prices.length).fill(null);
  let avgGain=0, avgLoss=0;
  for (let i=1;i<=period;i++) { const ch=prices[i]-prices[i-1]; if(ch>0)avgGain+=ch; else avgLoss+=Math.abs(ch); }
  avgGain/=period; avgLoss/=period;
  rsiValues[period] = avgLoss===0?100:100-100/(1+avgGain/avgLoss);
  for (let i=period+1;i<prices.length;i++) {
    const ch=prices[i]-prices[i-1];
    avgGain=(avgGain*(period-1)+(ch>0?ch:0))/period;
    avgLoss=(avgLoss*(period-1)+(ch<0?Math.abs(ch):0))/period;
    rsiValues[i]=avgLoss===0?100:100-100/(1+avgGain/avgLoss);
  }
  const weeklyRSIMap = new Map(weekly.map((w,i)=>([w.date,{rsi:rsiValues[i],prevRSI:i>0?rsiValues[i-1]:null}])));
  let lastMode: ModeKey = 'safe';
  return priceData.map(d=>{
    const w = weeklyRSIMap.get(d.date);
    if (w && w.rsi!==null && w.prevRSI!==null) {
      const curr=w.rsi, prev=w.prevRSI, rising=curr>prev, falling=curr<prev;
      if (falling && curr<40)                                 lastMode='cash';
      else if (falling||(prev>=50&&curr<50)||curr>65)         lastMode='safe';
      else if (curr>=55&&curr<=65&&rising)                    lastMode='bull';
      else if (rising||(prev<50&&curr>=50))                   lastMode='aggressive';
    }
    return {...d,mode:lastMode};
  });
}

// ── Engine ────────────────────────────────────────────────
class Engine {
  private nextIdx = 0;
  private activeMode: ModeKey = 'safe';
  constructor(
    private cfg: { divisions: number; rebalancePeriod: number },
    private modeCfgs: Record<'safe'|'aggressive'|'bull', ModeConfig>
  ) {}

  private mc(): ModeConfig {
    const m = this.activeMode==='cash'?'safe':this.activeMode;
    return this.modeCfgs[m];
  }

  private initDivs(): DivisionPortfolio[] {
    this.nextIdx = 0;
    const amt = IC / this.cfg.divisions;
    return Array.from({length:this.cfg.divisions},(_,i)=>({
      divisionName:`분할${i+1}`, divisionNumber:i+1, status:'EMPTY' as const,
      cash:amt, holdings:0, avgPrice:0, buyDate:'', buyPrice:0, totalCost:0,
      currentValue:0, unrealizedPL:0, unrealizedPLRate:0,
      buyLimitPrice:0, sellLimitPrice:0, tradingDaysHeld:0
    }));
  }

  private rebalance(divs: DivisionPortfolio[], price: number): DivisionPortfolio[] {
    const tc=divs.reduce((s,d)=>s+d.cash,0), ts=divs.reduce((s,d)=>s+d.holdings*price,0);
    const target=(tc+ts)/this.cfg.divisions;
    let need=0;
    const needs=divs.map(d=>{ if(d.status!=='HOLDING')return 0; const n=Math.max(0,target-d.holdings*price); need+=n; return n; });
    const scale=need>0?Math.min(1,tc/need):1;
    const used=needs.reduce((s,n)=>s+n*scale,0);
    const rem=tc-used, ec=divs.filter(d=>d.status==='EMPTY').length, cpe=ec>0?rem/ec:0;
    return divs.map((d,i)=>d.status==='HOLDING'
      ?{...d,cash:needs[i]*scale}
      :{...d,cash:cpe,holdings:0,avgPrice:0,buyDate:'',buyPrice:0,totalCost:0,currentValue:0,unrealizedPL:0,unrealizedPLRate:0,buyLimitPrice:0,sellLimitPrice:0,tradingDaysHeld:0,status:'EMPTY' as const}
    );
  }

  private updateStatus(divs: DivisionPortfolio[], price: number, date: string): DivisionPortfolio[] {
    const c=this.mc();
    return divs.map(d=>{
      if(d.status==='EMPTY') return {...d,buyLimitPrice:price*(1+c.buyTarget),sellLimitPrice:0,tradingDaysHeld:0,currentValue:0,unrealizedPL:0,unrealizedPLRate:0};
      const cv=d.holdings*price, upl=cv-d.totalCost, uplr=d.totalCost>0?(upl/d.totalCost)*100:0;
      const td=d.buyDate?calcTradingDays(d.buyDate,date):0;
      return {...d,currentValue:cv,unrealizedPL:upl,unrealizedPLRate:uplr,buyLimitPrice:price*(1+c.buyTarget),sellLimitPrice:d.avgPrice*(1+c.sellTarget),tradingDaysHeld:td};
    });
  }

  private toEmpty(divs: DivisionPortfolio[]) {
    for (let i=0;i<divs.length;i++) { const idx=(this.nextIdx+i)%divs.length; if(divs[idx].status==='EMPTY'){this.nextIdx=idx;return;} }
  }

  private checkBuy(d: DivisionPortfolio, close: number, prev: number|null): DivisionAction|null {
    if(this.activeMode==='cash') return null;
    if(!prev||d.status!=='HOLDING'&&d.divisionNumber!==this.nextIdx+1||d.status!=='EMPTY'||d.cash<MIN_CASH) return null;
    const c=this.mc(), chg=(close-prev)/prev;
    if(chg>c.buyTarget) return null;
    const qty=Math.floor(d.cash/(close*(1+getTotalFeeRate())));
    if(!qty) return null;
    const amt=qty*close;
    return {divisionName:d.divisionName,divisionNumber:d.divisionNumber,action:'BUY',quantity:qty,price:close,limitPrice:prev*(1+c.buyTarget),amount:amt,commission:amt*getTotalFeeRate(),reason:`매수 ${(chg*100).toFixed(2)}%`};
  }

  private checkSell(d: DivisionPortfolio, close: number, date: string): DivisionAction|null {
    if(d.status!=='HOLDING'||!d.holdings) return null;
    const c=this.mc(), td=d.buyDate?calcTradingDays(d.buyDate,date):0;
    if(td>=c.holdingDays) {
      const amt=d.holdings*close, comm=amt*getTotalFeeRate(), profit=amt-d.totalCost-comm;
      return {divisionName:d.divisionName,divisionNumber:d.divisionNumber,action:'STOP_LOSS',quantity:d.holdings,price:close,limitPrice:close,amount:amt,commission:comm,profit,profitRate:(profit/d.totalCost)*100,tradingDaysHeld:td,reason:`손절 ${td}일`};
    }
    const sl=d.avgPrice*(1+c.sellTarget);
    if(close>=sl) {
      const amt=d.holdings*sl, comm=amt*getTotalFeeRate(), profit=amt-d.totalCost-comm;
      return {divisionName:d.divisionName,divisionNumber:d.divisionNumber,action:'SELL',quantity:d.holdings,price:sl,limitPrice:sl,amount:amt,commission:comm,profit,profitRate:(profit/d.totalCost)*100,tradingDaysHeld:td,reason:`목표매도`};
    }
    return null;
  }

  private checkCashExit(d: DivisionPortfolio, close: number, date: string): DivisionAction|null {
    if(d.status!=='HOLDING'||!d.holdings) return null;
    const td=d.buyDate?calcTradingDays(d.buyDate,date):0;
    const amt=d.holdings*close, comm=amt*getTotalFeeRate(), profit=amt-d.totalCost-comm;
    return {divisionName:d.divisionName,divisionNumber:d.divisionNumber,action:'STOP_LOSS',quantity:d.holdings,price:close,limitPrice:close,amount:amt,commission:comm,profit,profitRate:(profit/d.totalCost)*100,tradingDaysHeld:td,reason:`하락장 청산`};
  }

  backtest(data: MarketData[], modeMap: Map<string,ModeKey>): DailyRecord[] {
    if(!data.length) return [];
    const records: DailyRecord[] = [];
    let divs = this.initDivs();
    data.forEach((d,i)=>{
      const m=modeMap.get(d.date); if(m) this.activeMode=m;
      const prevClose=i>0?data[i-1].price:null;
      const isRebal=i>0&&i%this.cfg.rebalancePeriod===0;
      if(isRebal) divs=this.rebalance(divs,d.price);
      divs=this.updateStatus(divs,d.price,d.date);
      this.toEmpty(divs);

      type SE={divIdx:number;signal:DivisionAction;type:'buy'|'sell'};
      const sigs: SE[]=[];
      let buyFound=false;
      for(let j=0;j<divs.length;j++){
        const sell=this.activeMode==='cash'?this.checkCashExit(divs[j],d.price,d.date):this.checkSell(divs[j],d.price,d.date);
        if(sell) sigs.push({divIdx:j,signal:sell,type:'sell'});
        if(!buyFound){const buy=this.checkBuy(divs[j],d.price,prevClose);if(buy){sigs.push({divIdx:j,signal:buy,type:'buy'});buyFound=true;}}
      }
      const bq=sigs.filter(s=>s.type==='buy').reduce((a,s)=>a+s.signal.quantity,0);
      const sq=sigs.filter(s=>s.type==='sell').reduce((a,s)=>a+s.signal.quantity,0);
      const netted=Math.min(bq,sq);
      const bf=bq>0?(bq-netted)/bq:1, sf=sq>0?(sq-netted)/sq:1;

      const actions: DivisionAction[]=[];
      let tb=0,ts2=0,dpl=0;
      for(const{divIdx,signal,type}of sigs){
        if(type==='buy'){
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
          ts2+=signal.quantity; dpl+=profit;
        }
      }
      const tc2=divs.reduce((s,x)=>s+x.cash,0), tv=divs.reduce((s,x)=>s+x.currentValue,0);
      records.push({
        date:d.date, closePrice:d.price, mode:this.activeMode,
        divisionActions:actions, divisionPortfolios:divs,
        totalBuyQuantity:tb, totalSellQuantity:ts2, netQuantity:tb-ts2,
        isNetted:netted>0, savedCommission:netted*d.price*getTotalFeeRate()*2,
        dailyRealizedPL:dpl, totalCash:tc2, totalHoldings:divs.reduce((s,x)=>s+x.holdings,0),
        totalValue:tv, totalAssets:tc2+tv,
        returnRate:((tc2+tv-IC)/IC)*100,
        isRebalanceDay:isRebal
      });
      divs=records[records.length-1].divisionPortfolios;
    });
    return records;
  }
}

function calcStats(records: DailyRecord[]) {
  if(!records.length) return null;
  const last=records[records.length-1];
  let peak=IC, mdd=0;
  for(const r of records){ if(r.totalAssets>peak)peak=r.totalAssets; const dd=(peak-r.totalAssets)/peak*100; if(dd>mdd)mdd=dd; }
  const sells=records.flatMap(r=>r.divisionActions).filter(a=>a.action==='SELL'||a.action==='STOP_LOSS');
  const sl=sells.filter(a=>a.action==='STOP_LOSS').length;
  const bnh=((last.closePrice-records[0].closePrice)/records[0].closePrice)*100;
  return { ret:((last.totalAssets-IC)/IC)*100, mdd, sl, trades:sells.length, bnh,
           buyDays:records.filter(r=>r.totalBuyQuantity>0).length, totalDays:records.length };
}

async function fetchSOXL(): Promise<MarketData[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/SOXL?range=6000d&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if(!res.ok) throw new Error(`Yahoo Finance 오류: ${res.status}`);
  const data = await res.json();
  const result = data.chart?.result?.[0];
  if(!result) throw new Error('데이터 없음');
  const timestamps: number[] = result.timestamp||[];
  const closes: number[] = result.indicators?.quote?.[0]?.close||[];
  const opens: number[] = result.indicators?.quote?.[0]?.open||[];
  const highs: number[] = result.indicators?.quote?.[0]?.high||[];
  const lows: number[] = result.indicators?.quote?.[0]?.low||[];
  const volumes: number[] = result.indicators?.quote?.[0]?.volume||[];
  return timestamps.map((ts,i)=>{
    const price=Number((closes[i]||0).toFixed(2));
    const prev=i>0?(closes[i-1]||price):price;
    const change=Number((price-prev).toFixed(2));
    return { date:new Date(ts*1000).toISOString().split('T')[0], price, change,
             changePercent:Number(((change/prev)*100).toFixed(2)), volume:volumes[i]||0,
             high:Number((highs[i]||price).toFixed(2)), low:Number((lows[i]||price).toFixed(2)),
             open:Number((opens[i]||price).toFixed(2)) };
  }).filter(d=>d.price>0);
}

async function main() {
  console.log('SOXL 데이터 로드 중...');
  const rawData = await fetchSOXL();
  const firstDate = rawData[0].date, lastDate = rawData[rawData.length-1].date;
  console.log(`총 ${rawData.length}거래일 (${firstDate} ~ ${lastDate})\n`);

  // 전체 데이터로 RSI 모드 계산 (연속성 유지)
  const allWithMode = enrichWithMode(rawData);
  const allModeMap = new Map<string,ModeKey>();
  allWithMode.forEach(x=>allModeMap.set(x.date,x.mode));

  const startYear = parseInt(firstDate.split('-')[0]);
  const endYear   = parseInt(lastDate.split('-')[0]);

  type YearRow = {
    year: number; days: number;
    v3ret: number; v31ret: number;
    v3mdd: number; v31mdd: number;
    v3sl: number;  v31sl: number;
    v3buy: number; v31buy: number;
    bnh: number;
  };

  const rows: YearRow[] = [];

  for (let year=startYear; year<=endYear; year++) {
    const start=`${year}-01-01`, end=`${year}-12-31`;
    const yearData = rawData.filter(d=>d.date>=start&&d.date<=end);
    if(yearData.length<10) continue;

    const engV3  = new Engine({divisions:DIV,rebalancePeriod:RP}, V3);
    const engV31 = new Engine({divisions:DIV,rebalancePeriod:RP}, V31);
    const recV3  = engV3.backtest(yearData, allModeMap);
    const recV31 = engV31.backtest(yearData, allModeMap);
    const sV3=calcStats(recV3), sV31=calcStats(recV31);
    if(!sV3||!sV31) continue;

    rows.push({
      year, days:yearData.length,
      v3ret:sV3.ret, v31ret:sV31.ret,
      v3mdd:sV3.mdd, v31mdd:sV31.mdd,
      v3sl:sV3.sl,   v31sl:sV31.sl,
      v3buy:Math.round(sV3.buyDays/sV3.totalDays*100),
      v31buy:Math.round(sV31.buyDays/sV31.totalDays*100),
      bnh:sV3.bnh
    });
  }

  // ── 출력 ──────────────────────────────────────────────
  const W = 120;
  console.log('='.repeat(W));
  console.log('  동파법 v3 vs v3.1 연도별 비교 (div=10, rp=10)');
  console.log('  v3 : safe -4%/0.8%/30일, aggr -5%/6%/10일');
  console.log('  v3.1: safe -3%/2.0%/20일, aggr -5%/8%/7일');
  console.log('='.repeat(W));

  const h = (s: string, w: number) => s.padEnd(w);
  const f = (v: number) => (v>=0?'+':'')+v.toFixed(1)+'%';
  const d = (a: number, b: number) => { const diff=b-a; return (diff>=0?'+':'')+diff.toFixed(1)+'%'; };

  console.log(
    h('  연도',7)+h('일수',5)+
    h('v3 수익',10)+h('v3.1 수익',10)+h('개선',8)+
    h('v3 MDD',9)+h('v3.1 MDD',9)+h('MDD개선',8)+
    h('v3 손절',8)+h('v3.1 손절',9)+
    h('v3 매수%',9)+h('v3.1 매수%',10)+
    h('B&H',8)
  );
  console.log('-'.repeat(W));

  let tV3=1, tV31=1, tBnh=1;
  for (const r of rows) {
    const retDiff = r.v31ret - r.v3ret;
    const mddDiff = r.v31mdd - r.v3mdd; // 음수면 MDD 감소 = 개선
    const mark = retDiff > 0.5 ? '↑' : retDiff < -0.5 ? '↓' : '=';
    console.log(
      h('  '+r.year,7)+h(String(r.days),5)+
      h(f(r.v3ret),10)+h(f(r.v31ret),10)+h(mark+d(r.v3ret,r.v31ret),8)+
      h('-'+r.v3mdd.toFixed(1)+'%',9)+h('-'+r.v31mdd.toFixed(1)+'%',9)+h(d(r.v3mdd,r.v31mdd),8)+
      h(String(r.v3sl),8)+h(String(r.v31sl),9)+
      h(r.v3buy+'%',9)+h(r.v31buy+'%',10)+
      h(f(r.bnh),8)
    );
    tV3 *= (1+r.v3ret/100); tV31 *= (1+r.v31ret/100); tBnh *= (1+r.bnh/100);
  }

  console.log('-'.repeat(W));
  const cumV3=(tV3-1)*100, cumV31=(tV31-1)*100, cumBnh=(tBnh-1)*100;
  console.log(
    h('  누적',7)+h('',5)+
    h(f(cumV3),10)+h(f(cumV31),10)+h(d(cumV3,cumV31),8)+
    h('',9)+h('',9)+h('',8)+h('',8)+h('',9)+h('',9)+h('',10)+
    h(f(cumBnh),8)
  );
  console.log('='.repeat(W));

  // ── 구간별 요약 ──────────────────────────────────────────
  const periods = [
    { label: '학습 (2022~24)', start: 2022, end: 2024 },
    { label: '검증 (2025)',    start: 2025, end: 2025 },
    { label: '전체 (2010~)',   start: 0,    end: 9999 },
  ];
  console.log('\n구간별 요약:');
  for (const p of periods) {
    const pr = rows.filter(r=>r.year>=p.start&&r.year<=p.end);
    if(!pr.length) continue;
    let pV3=1, pV31=1;
    for(const r of pr){ pV3*=(1+r.v3ret/100); pV31*=(1+r.v31ret/100); }
    const cv3=(pV3-1)*100, cv31=(pV31-1)*100;
    console.log(`  ${p.label.padEnd(18)} v3: ${f(cv3).padEnd(9)} v3.1: ${f(cv31).padEnd(9)} 개선: ${d(cv3,cv31)}`);
  }
}

main().catch(console.error);
