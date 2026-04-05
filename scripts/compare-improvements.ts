/**
 * 전략 개선 비교: v3.1 vs v3.1+A vs v3.1+B vs v3.1+AB
 * npx tsx --tsconfig tsconfig.json scripts/compare-improvements.ts
 *
 * v3.1   (기준): safe -3%/2%/20일,  aggr -5%/8%/7일,  bull -3%/12%/45일
 * +A (매수완화): bull 모드에서 buyTarget = +1% (보합/소폭상승일도 매수)
 * +B (트레일링): bull/aggr 모드에서 고정 매도목표 대신 고점 대비 -15% 하락 시 매도
 * +AB          : A + B 동시 적용
 *
 * B&H 아이디어:
 *   B&H = "올라갈 때 팔지 않는다" → Trailing Stop (추세 끝날 때까지 홀딩)
 *   B&H = "기회가 있으면 산다"    → 매수 임계값 완화 (상승장 참여)
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
  highSinceBuy: number; // trailing stop용 고점 추적
}
interface DivisionAction {
  divisionName: string; divisionNumber: number;
  action: 'BUY' | 'SELL' | 'STOP_LOSS';
  quantity: number; price: number; limitPrice: number;
  amount: number; commission: number;
  profit?: number; profitRate?: number; tradingDaysHeld?: number; reason: string;
}
interface DailyRecord {
  date: string; closePrice: number; mode: string;
  divisionActions: DivisionAction[]; divisionPortfolios: DivisionPortfolio[];
  totalBuyQuantity: number; totalSellQuantity: number;
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

// ── 파라미터 세트 ─────────────────────────────────────────────
const BASE_CONFIGS: Record<'safe'|'aggressive'|'bull', ModeConfig> = {
  safe:       { sellTarget: 0.02,  buyTarget: -0.03, holdingDays: 20 },
  aggressive: { sellTarget: 0.08,  buyTarget: -0.05, holdingDays: 7  },
  bull:       { sellTarget: 0.12,  buyTarget: -0.03, holdingDays: 45 },
};
const DIV = 10, RP = 10;

// A: bull 모드 매수 임계값 완화 (+1% → 보합/소폭상승일도 매수)
const BULL_BUY_RELAXED = 0.01;
// B: trailing stop 비율 (고점 대비 -15% 하락 시 매도)
const TRAILING_STOP_PCT = 0.15;
// B가 적용되는 모드
const TRAILING_MODES: ModeKey[] = ['bull', 'aggressive'];

// ── 유틸 ──────────────────────────────────────────────────────
function calcTradingDays(start: string, end: string): number {
  const parse = (s: string) => { const [y,m,d]=s.split('-').map(Number); return Date.UTC(y,m-1,d); };
  const s=parse(start), e=parse(end);
  if(s>e) return 0;
  const total=Math.floor((e-s)/86400000)+1;
  const full=Math.floor(total/7);
  let td=full*5;
  const startDow=new Date(s).getUTCDay(), rem=total%7;
  for(let i=0;i<rem;i++){const dow=(startDow+i)%7; if(dow&&dow!==6) td++;}
  return td;
}

function getWeekNumber(date: Date): number {
  const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const day=d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-day);
  const y=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d.getTime()-y.getTime())/86400000)+1)/7);
}

function enrichWithMode(priceData: MarketData[]): (MarketData & { mode: ModeKey })[] {
  const weeks: Record<string,MarketData[]>={};
  for(const d of priceData){
    const dt=new Date(d.date);
    const key=`${dt.getFullYear()}-W${String(getWeekNumber(dt)).padStart(2,'0')}`;
    if(!weeks[key]) weeks[key]=[];
    weeks[key].push(d);
  }
  const weekly=Object.keys(weeks).sort().map(k=>{
    const wd=weeks[k];
    return wd.find(d=>new Date(d.date).getDay()===5)??wd[wd.length-1];
  });
  const period=14;
  if(weekly.length<period+1) return priceData.map(d=>({...d,mode:'safe' as ModeKey}));
  const prices=weekly.map(d=>d.price);
  const rsiValues: (number|null)[]=new Array(prices.length).fill(null);
  let avgGain=0, avgLoss=0;
  for(let i=1;i<=period;i++){const ch=prices[i]-prices[i-1]; if(ch>0)avgGain+=ch; else avgLoss+=Math.abs(ch);}
  avgGain/=period; avgLoss/=period;
  rsiValues[period]=avgLoss===0?100:100-100/(1+avgGain/avgLoss);
  for(let i=period+1;i<prices.length;i++){
    const ch=prices[i]-prices[i-1];
    avgGain=(avgGain*(period-1)+(ch>0?ch:0))/period;
    avgLoss=(avgLoss*(period-1)+(ch<0?Math.abs(ch):0))/period;
    rsiValues[i]=avgLoss===0?100:100-100/(1+avgGain/avgLoss);
  }
  const rsiMap=new Map(weekly.map((w,i)=>([w.date,{rsi:rsiValues[i],prevRSI:i>0?rsiValues[i-1]:null}])));
  let lastMode: ModeKey='safe';
  return priceData.map(d=>{
    const w=rsiMap.get(d.date);
    if(w&&w.rsi!==null&&w.prevRSI!==null){
      const curr=w.rsi, prev=w.prevRSI, rising=curr>prev, falling=curr<prev;
      if(falling&&curr<40)                              lastMode='cash';
      else if(falling||(prev>=50&&curr<50)||curr>65)    lastMode='safe';
      else if(curr>=55&&curr<=65&&rising)               lastMode='bull';
      else if(rising||(prev<50&&curr>=50))              lastMode='aggressive';
    }
    return {...d,mode:lastMode};
  });
}

// ── Engine ────────────────────────────────────────────────────
interface EngineOptions {
  useRelaxedBullBuy: boolean;   // 개선 A
  useTrailingStop: boolean;     // 개선 B
}

class Engine {
  private nextIdx=0;
  private activeMode: ModeKey='safe';

  constructor(
    private cfg: { divisions: number; rebalancePeriod: number },
    private modeCfgs: Record<'safe'|'aggressive'|'bull', ModeConfig>,
    private opts: EngineOptions
  ){}

  private mc(): ModeConfig {
    const m=this.activeMode==='cash'?'safe':this.activeMode;
    return this.modeCfgs[m];
  }

  private effectiveBuyTarget(): number {
    // A: bull 모드에서 완화된 매수 임계값 사용
    if(this.opts.useRelaxedBullBuy && this.activeMode==='bull') return BULL_BUY_RELAXED;
    return this.mc().buyTarget;
  }

  private initDivs(): DivisionPortfolio[] {
    this.nextIdx=0;
    const amt=IC/this.cfg.divisions;
    return Array.from({length:this.cfg.divisions},(_,i)=>({
      divisionName:`분할${i+1}`, divisionNumber:i+1, status:'EMPTY' as const,
      cash:amt, holdings:0, avgPrice:0, buyDate:'', buyPrice:0, totalCost:0,
      currentValue:0, unrealizedPL:0, unrealizedPLRate:0,
      buyLimitPrice:0, sellLimitPrice:0, tradingDaysHeld:0, highSinceBuy:0
    }));
  }

  private rebalance(divs: DivisionPortfolio[], price: number): DivisionPortfolio[] {
    const tc=divs.reduce((s,d)=>s+d.cash,0), ts=divs.reduce((s,d)=>s+d.holdings*price,0);
    const target=(tc+ts)/this.cfg.divisions;
    let need=0;
    const needs=divs.map(d=>{if(d.status!=='HOLDING')return 0;const n=Math.max(0,target-d.holdings*price);need+=n;return n;});
    const scale=need>0?Math.min(1,tc/need):1;
    const used=needs.reduce((s,n)=>s+n*scale,0), rem=tc-used;
    const ec=divs.filter(d=>d.status==='EMPTY').length, cpe=ec>0?rem/ec:0;
    return divs.map((d,i)=>d.status==='HOLDING'
      ?{...d,cash:needs[i]*scale}
      :{...d,cash:cpe,holdings:0,avgPrice:0,buyDate:'',buyPrice:0,totalCost:0,
        currentValue:0,unrealizedPL:0,unrealizedPLRate:0,buyLimitPrice:0,sellLimitPrice:0,tradingDaysHeld:0,highSinceBuy:0,status:'EMPTY' as const}
    );
  }

  private updateStatus(divs: DivisionPortfolio[], price: number, date: string): DivisionPortfolio[] {
    const c=this.mc(), buyT=this.effectiveBuyTarget();
    return divs.map(d=>{
      if(d.status==='EMPTY') return {...d,buyLimitPrice:price*(1+buyT),sellLimitPrice:0,tradingDaysHeld:0,currentValue:0,unrealizedPL:0,unrealizedPLRate:0,highSinceBuy:0};
      const newHigh=Math.max(d.highSinceBuy||d.avgPrice, price);
      const cv=d.holdings*price, upl=cv-d.totalCost, uplr=d.totalCost>0?(upl/d.totalCost)*100:0;
      const td=d.buyDate?calcTradingDays(d.buyDate,date):0;
      return {...d,currentValue:cv,unrealizedPL:upl,unrealizedPLRate:uplr,
               buyLimitPrice:price*(1+buyT),sellLimitPrice:d.avgPrice*(1+c.sellTarget),
               tradingDaysHeld:td,highSinceBuy:newHigh};
    });
  }

  private toEmpty(divs: DivisionPortfolio[]) {
    for(let i=0;i<divs.length;i++){const idx=(this.nextIdx+i)%divs.length; if(divs[idx].status==='EMPTY'){this.nextIdx=idx;return;}}
  }

  private checkBuy(d: DivisionPortfolio, close: number, prev: number|null): DivisionAction|null {
    if(this.activeMode==='cash') return null;
    if(!prev||d.status!=='EMPTY'||d.divisionNumber!==this.nextIdx+1||d.cash<MIN_CASH) return null;
    const chg=(close-prev)/prev;
    if(chg>this.effectiveBuyTarget()) return null;
    const qty=Math.floor(d.cash/(close*(1+getTotalFeeRate())));
    if(!qty) return null;
    const amt=qty*close;
    return {divisionName:d.divisionName,divisionNumber:d.divisionNumber,action:'BUY',
            quantity:qty,price:close,limitPrice:prev*(1+this.effectiveBuyTarget()),
            amount:amt,commission:amt*getTotalFeeRate(),reason:`매수 ${(chg*100).toFixed(2)}%`};
  }

  private checkSell(d: DivisionPortfolio, close: number, date: string): DivisionAction|null {
    if(d.status!=='HOLDING'||!d.holdings) return null;
    const c=this.mc(), td=d.buyDate?calcTradingDays(d.buyDate,date):0;

    // 최대 보유기간 초과 → 강제 손절 (trailing stop 여부 무관)
    if(td>=c.holdingDays){
      const amt=d.holdings*close, comm=amt*getTotalFeeRate(), profit=amt-d.totalCost-comm;
      return {divisionName:d.divisionName,divisionNumber:d.divisionNumber,action:'STOP_LOSS',
              quantity:d.holdings,price:close,limitPrice:close,amount:amt,commission:comm,
              profit,profitRate:(profit/d.totalCost)*100,tradingDaysHeld:td,reason:`손절 ${td}일`};
    }

    // B: trailing stop 적용 모드 (bull/aggressive)
    const useTrailing = this.opts.useTrailingStop && TRAILING_MODES.includes(this.activeMode);
    if(useTrailing) {
      const high=d.highSinceBuy||d.avgPrice;
      const trailingPrice=high*(1-TRAILING_STOP_PCT);
      if(close<=trailingPrice){
        const amt=d.holdings*close, comm=amt*getTotalFeeRate(), profit=amt-d.totalCost-comm;
        return {divisionName:d.divisionName,divisionNumber:d.divisionNumber,action:'STOP_LOSS',
                quantity:d.holdings,price:close,limitPrice:close,amount:amt,commission:comm,
                profit,profitRate:(profit/d.totalCost)*100,tradingDaysHeld:td,
                reason:`트레일링 고점$${high.toFixed(2)}→$${close.toFixed(2)}`};
      }
      return null; // 트레일링 조건 미달 → 계속 보유
    }

    // 기본: 고정 매도목표
    const sl=d.avgPrice*(1+c.sellTarget);
    if(close>=sl){
      const amt=d.holdings*sl, comm=amt*getTotalFeeRate(), profit=amt-d.totalCost-comm;
      return {divisionName:d.divisionName,divisionNumber:d.divisionNumber,action:'SELL',
              quantity:d.holdings,price:sl,limitPrice:sl,amount:amt,commission:comm,
              profit,profitRate:(profit/d.totalCost)*100,tradingDaysHeld:td,reason:`목표매도`};
    }
    return null;
  }

  private checkCashExit(d: DivisionPortfolio, close: number, date: string): DivisionAction|null {
    if(d.status!=='HOLDING'||!d.holdings) return null;
    const td=d.buyDate?calcTradingDays(d.buyDate,date):0;
    const amt=d.holdings*close, comm=amt*getTotalFeeRate(), profit=amt-d.totalCost-comm;
    return {divisionName:d.divisionName,divisionNumber:d.divisionNumber,action:'STOP_LOSS',
            quantity:d.holdings,price:close,limitPrice:close,amount:amt,commission:comm,
            profit,profitRate:(profit/d.totalCost)*100,tradingDaysHeld:td,reason:`하락장 청산`};
  }

  backtest(data: MarketData[], modeMap: Map<string,ModeKey>): DailyRecord[] {
    if(!data.length) return [];
    const records: DailyRecord[]=[];
    let divs=this.initDivs();
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
          divs[divIdx]={...divs[divIdx],status:'HOLDING',cash:divs[divIdx].cash-adj.amount-adj.commission,
            holdings:adj.quantity,avgPrice:adj.price,buyDate:d.date,buyPrice:adj.price,
            totalCost:adj.amount+adj.commission,highSinceBuy:adj.price};
          tb+=signal.quantity; this.nextIdx=(this.nextIdx+1)%this.cfg.divisions;
        } else {
          const comm=signal.commission*sf, profit=(signal.profit??0)+(signal.commission-comm);
          const pr=divs[divIdx].totalCost>0?(profit/divs[divIdx].totalCost)*100:(signal.profitRate??0);
          const adj={...signal,commission:comm,profit,profitRate:pr};
          actions.push(adj);
          divs[divIdx]={...divs[divIdx],status:'EMPTY',cash:divs[divIdx].cash+adj.amount-adj.commission,
            holdings:0,avgPrice:0,buyDate:'',buyPrice:0,totalCost:0,highSinceBuy:0};
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
  for(const r of records){if(r.totalAssets>peak)peak=r.totalAssets; const dd=(peak-r.totalAssets)/peak*100; if(dd>mdd)mdd=dd;}
  const sells=records.flatMap(r=>r.divisionActions).filter(a=>a.action==='SELL'||a.action==='STOP_LOSS');
  const sl=sells.filter(a=>a.action==='STOP_LOSS').length;
  const bnh=((last.closePrice-records[0].closePrice)/records[0].closePrice)*100;
  const buyDays=records.filter(r=>r.totalBuyQuantity>0).length;
  return {ret:((last.totalAssets-IC)/IC)*100, mdd, sl, trades:sells.length, bnh,
          buyDays, totalDays:records.length};
}

async function fetchSOXL(): Promise<MarketData[]> {
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/SOXL?range=6000d&interval=1d`;
  const res=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}});
  if(!res.ok) throw new Error(`Yahoo Finance 오류: ${res.status}`);
  const data=await res.json();
  const result=data.chart?.result?.[0];
  if(!result) throw new Error('데이터 없음');
  const timestamps: number[]=result.timestamp||[];
  const closes: number[]=result.indicators?.quote?.[0]?.close||[];
  const opens: number[]=result.indicators?.quote?.[0]?.open||[];
  const highs: number[]=result.indicators?.quote?.[0]?.high||[];
  const lows: number[]=result.indicators?.quote?.[0]?.low||[];
  const volumes: number[]=result.indicators?.quote?.[0]?.volume||[];
  return timestamps.map((ts,i)=>{
    const price=Number((closes[i]||0).toFixed(2));
    const prev=i>0?(closes[i-1]||price):price;
    const change=Number((price-prev).toFixed(2));
    return {date:new Date(ts*1000).toISOString().split('T')[0],price,change,
            changePercent:Number(((change/prev)*100).toFixed(2)),volume:volumes[i]||0,
            high:Number((highs[i]||price).toFixed(2)),low:Number((lows[i]||price).toFixed(2)),
            open:Number((opens[i]||price).toFixed(2))};
  }).filter(d=>d.price>0);
}

async function main() {
  console.log('SOXL 데이터 로드 중...');
  const rawData=await fetchSOXL();
  const firstDate=rawData[0].date, lastDate=rawData[rawData.length-1].date;
  console.log(`총 ${rawData.length}거래일 (${firstDate} ~ ${lastDate})\n`);

  const allWithMode=enrichWithMode(rawData);
  const allModeMap=new Map<string,ModeKey>();
  allWithMode.forEach(x=>allModeMap.set(x.date,x.mode));

  const startYear=parseInt(firstDate.split('-')[0]);
  const endYear=parseInt(lastDate.split('-')[0]);

  const variants = [
    { label: 'v3.1',    opts: { useRelaxedBullBuy: false, useTrailingStop: false } },
    { label: '+A(매수)', opts: { useRelaxedBullBuy: true,  useTrailingStop: false } },
    { label: '+B(트레)', opts: { useRelaxedBullBuy: false, useTrailingStop: true  } },
    { label: '+AB',     opts: { useRelaxedBullBuy: true,  useTrailingStop: true   } },
  ] as const;

  type Row = { year: number; days: number; bnh: number; rets: number[]; mdds: number[]; sls: number[]; buys: number[] };
  const rows: Row[] = [];

  for(let year=startYear;year<=endYear;year++){
    const start=`${year}-01-01`, end=`${year}-12-31`;
    const yearData=rawData.filter(d=>d.date>=start&&d.date<=end);
    if(yearData.length<10) continue;

    const rets: number[]=[], mdds: number[]=[], sls: number[]=[], buys: number[]=[];
    let bnh=0;
    for(const v of variants){
      const eng=new Engine({divisions:DIV,rebalancePeriod:RP}, BASE_CONFIGS, v.opts);
      const recs=eng.backtest(yearData,allModeMap);
      const s=calcStats(recs);
      if(!s) continue;
      rets.push(s.ret); mdds.push(s.mdd); sls.push(s.sl);
      buys.push(Math.round(s.buyDays/s.totalDays*100));
      bnh=s.bnh;
    }
    rows.push({year,days:yearData.length,bnh,rets,mdds,sls,buys});
  }

  // ── 출력 ──────────────────────────────────────────────────────
  const W=130;
  console.log('='.repeat(W));
  console.log('  동파법 개선 비교 (div=10, rp=10)');
  console.log('  A: bull 모드 매수 임계값 +1% (보합/소폭상승일도 매수)');
  console.log('  B: trailing stop -15% (bull/aggr 모드에서 고점 대비 -15% 하락 시 매도)');
  console.log('  B&H 아이디어: "올라갈 때 팔지 않는다(B)" + "기회가 있으면 산다(A)"');
  console.log('='.repeat(W));

  const h=(s:string,w:number)=>s.padEnd(w);
  const f=(v:number)=>(v>=0?'+':'')+v.toFixed(1)+'%';
  const d=(base:number,v:number)=>{const diff=v-base; return (diff>=0?'+':'')+diff.toFixed(1)+'%';};

  console.log(
    h('  연도',7)+h('일수',5)+
    h('v3.1',9)+h('+A(매수)',10)+h('+B(트레)',10)+h('+AB',9)+
    h('│ v3.1MDD',10)+h('+A MDD',9)+h('+B MDD',9)+h('+AB MDD',9)+
    h('│ 매수%A',8)+h('매수%AB',9)+
    h('│ B&H',8)
  );
  console.log('-'.repeat(W));

  const totals=[1,1,1,1], totalBnh=1;
  const totArr=[...totals];
  let totBnh2=1;

  for(const r of rows){
    if(r.rets.length<4) continue;
    console.log(
      h('  '+r.year,7)+h(String(r.days),5)+
      h(f(r.rets[0]),9)+h(f(r.rets[1]),10)+h(f(r.rets[2]),10)+h(f(r.rets[3]),9)+
      '│ '+h('-'+r.mdds[0].toFixed(1)+'%',10)+h('-'+r.mdds[1].toFixed(1)+'%',9)+h('-'+r.mdds[2].toFixed(1)+'%',9)+h('-'+r.mdds[3].toFixed(1)+'%',9)+
      '│ '+h(r.buys[1]+'%',8)+h(r.buys[3]+'%',9)+
      '│ '+f(r.bnh)
    );
    for(let i=0;i<4;i++) totArr[i]*=(1+r.rets[i]/100);
    totBnh2*=(1+r.bnh/100);
  }

  console.log('-'.repeat(W));
  const cumRets=totArr.map(t=>(t-1)*100), cumBnh=(totBnh2-1)*100;
  console.log(
    h('  누적',7)+h('',5)+
    h(f(cumRets[0]),9)+h(f(cumRets[1]),10)+h(f(cumRets[2]),10)+h(f(cumRets[3]),9)+
    '│ '+h('',10)+h('',9)+h('',9)+h('',9)+
    '│ '+h('',8)+h('',9)+
    '│ '+f(cumBnh)
  );
  console.log('='.repeat(W));

  // ── 구간별 요약 ────────────────────────────────────────────────
  const periods=[
    {label:'학습 (2022~24)',start:2022,end:2024},
    {label:'검증 (2025)',   start:2025,end:2025},
    {label:'전체 (2010~)', start:0,   end:9999},
  ];
  console.log('\n구간별 요약:');
  console.log('  '+['구간','v3.1','→+A','→+B','→+AB','B&H'].map((s,i)=>s.padEnd(i===0?20:12)).join(''));
  console.log('  '+'-'.repeat(80));
  for(const p of periods){
    const pr=rows.filter(r=>r.year>=p.start&&r.year<=p.end&&r.rets.length>=4);
    if(!pr.length) continue;
    let pArr=[1,1,1,1], pBnh=1;
    for(const r of pr){for(let i=0;i<4;i++) pArr[i]*=(1+r.rets[i]/100); pBnh*=(1+r.bnh/100);}
    const cRets=pArr.map(v=>(v-1)*100), cBnh=(pBnh-1)*100;
    console.log(
      '  '+p.label.padEnd(20)+
      cRets.map((v,i)=>(i===0?f(v):d(cRets[0],v)).padEnd(12)).join('')+
      f(cBnh)
    );
  }

  // ── 연도별 best variant 집계 ───────────────────────────────────
  console.log('\n연도별 최고 전략:');
  const labels=['v3.1','+A','+B','+AB'];
  const counts=[0,0,0,0];
  for(const r of rows){
    if(r.rets.length<4) continue;
    const maxRet=Math.max(...r.rets);
    const bestIdx=r.rets.indexOf(maxRet);
    counts[bestIdx]++;
  }
  labels.forEach((l,i)=>console.log(`  ${l.padEnd(12)}: ${counts[i]}년 (${Math.round(counts[i]/rows.length*100)}%)`));
}

main().catch(console.error);
