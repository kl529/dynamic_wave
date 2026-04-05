/**
 * 하이브리드 전략: B&H + 동파법
 * npx tsx --tsconfig tsconfig.json scripts/hybrid-bnh-dongpa.ts
 *
 * 아이디어:
 *   RSI 상승 (aggressive/bull) → B&H (전액 보유, 추세 타기)
 *   RSI 하락 (safe/cash)       → 동파법 (분할 매수/방어)
 *
 * 전환 로직:
 *   Dongpa→B&H: 분할 포지션 모두 청산 → 전액 매수
 *   B&H→Dongpa: 전량 매도 → 분할 자금 재배분
 *   B&H→Cash:   전량 매도 → 현금 보유
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
  action: 'BUY' | 'SELL' | 'STOP_LOSS';
  quantity: number; price: number; limitPrice: number;
  amount: number; commission: number;
  profit?: number; profitRate?: number; tradingDaysHeld?: number; reason: string;
}

const FEES = { commission: 0.00044, secFee: 0.0000278 };
const getTotalFeeRate = () => FEES.commission + FEES.secFee;
const MIN_CASH = 100;
const IC = 10000;

interface ModeConfig { sellTarget: number; buyTarget: number; holdingDays: number; }
type ModeKey = 'safe' | 'aggressive' | 'bull' | 'cash';
type StrategyMode = 'bnh' | 'dongpa' | 'cash';

// 동파법 v3.1 파라미터
const DONGPA_CONFIGS: Record<'safe'|'aggressive'|'bull', ModeConfig> = {
  safe:       { sellTarget: 0.02,  buyTarget: -0.03, holdingDays: 20 },
  aggressive: { sellTarget: 0.08,  buyTarget: -0.05, holdingDays: 7  },
  bull:       { sellTarget: 0.12,  buyTarget: -0.03, holdingDays: 45 },
};
const DIV = 10, RP = 10;

function isBnhMode(mode: ModeKey): StrategyMode {
  if (mode === 'aggressive' || mode === 'bull') return 'bnh';
  if (mode === 'cash') return 'cash';
  return 'dongpa';
}

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
    const wd=weeks[k]; return wd.find(d=>new Date(d.date).getDay()===5)??wd[wd.length-1];
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

// ── 동파법 분할 엔진 (내부 사용) ──────────────────────────────
function initDivisions(totalCash: number): DivisionPortfolio[] {
  const amt=totalCash/DIV;
  return Array.from({length:DIV},(_,i)=>({
    divisionName:`분할${i+1}`, divisionNumber:i+1, status:'EMPTY' as const,
    cash:amt, holdings:0, avgPrice:0, buyDate:'', buyPrice:0, totalCost:0,
    currentValue:0, unrealizedPL:0, unrealizedPLRate:0,
    buyLimitPrice:0, sellLimitPrice:0, tradingDaysHeld:0
  }));
}

function liquidateDivisions(divs: DivisionPortfolio[], price: number): number {
  let total=0;
  for(const d of divs){
    if(d.status==='HOLDING'&&d.holdings>0){
      const proceeds=d.holdings*price*(1-getTotalFeeRate());
      total+=proceeds;
    } else {
      total+=d.cash;
    }
  }
  return total;
}

function rebalanceDivisions(divs: DivisionPortfolio[], price: number): DivisionPortfolio[] {
  const tc=divs.reduce((s,d)=>s+d.cash,0), ts=divs.reduce((s,d)=>s+d.holdings*price,0);
  const target=(tc+ts)/DIV;
  let need=0;
  const needs=divs.map(d=>{if(d.status!=='HOLDING')return 0;const n=Math.max(0,target-d.holdings*price);need+=n;return n;});
  const scale=need>0?Math.min(1,tc/need):1;
  const used=needs.reduce((s,n)=>s+n*scale,0), rem=tc-used;
  const ec=divs.filter(d=>d.status==='EMPTY').length, cpe=ec>0?rem/ec:0;
  return divs.map((d,i)=>d.status==='HOLDING'
    ?{...d,cash:needs[i]*scale}
    :{...d,cash:cpe,holdings:0,avgPrice:0,buyDate:'',buyPrice:0,totalCost:0,
      currentValue:0,unrealizedPL:0,unrealizedPLRate:0,buyLimitPrice:0,sellLimitPrice:0,tradingDaysHeld:0,status:'EMPTY' as const}
  );
}

// ── 하이브리드 엔진 ────────────────────────────────────────────
interface DayResult {
  date: string;
  strategyMode: StrategyMode;
  rsiMode: ModeKey;
  totalAssets: number;
  returnRate: number;
  bnhHoldings: number;
  bnhCash: number;
  divisionAssets: number;
  transitioned: boolean;
  transitionNote: string;
}

function runHybrid(data: MarketData[], modeMap: Map<string,ModeKey>): DayResult[] {
  const results: DayResult[] = [];

  let stratMode: StrategyMode = 'dongpa';
  let bnhHoldings = 0;
  let bnhCash = IC;     // 초기엔 dongpa로 시작, 모든 자금이 분할에

  let divs = initDivisions(IC);
  let nextDivIdx = 0;
  let stepCount = 0;

  // 현재 분할엔진의 RSI 모드 (safe/aggressive/bull)
  let divRsiMode: ModeKey = 'safe';

  function getDivConfig(): ModeConfig {
    const m = divRsiMode === 'cash' ? 'safe' : divRsiMode;
    return DONGPA_CONFIGS[m];
  }

  function findNextEmpty(): number {
    for(let i=0;i<divs.length;i++){
      const idx=(nextDivIdx+i)%divs.length;
      if(divs[idx].status==='EMPTY') return idx;
    }
    return -1;
  }

  for(let i=0; i<data.length; i++) {
    const d = data[i];
    const prevClose = i>0 ? data[i-1].price : null;
    const rsiMode = modeMap.get(d.date) ?? divRsiMode;
    const newStratMode = isBnhMode(rsiMode);
    const transitioned = newStratMode !== stratMode;
    let transitionNote = '';

    // ── 모드 전환 처리 ──────────────────────────────────────
    if (transitioned) {
      if (newStratMode === 'bnh') {
        // Dongpa/Cash → B&H: 분할 전부 청산 후 전액 매수
        const liquidated = liquidateDivisions(divs, d.price);
        const totalAvail = liquidated + bnhCash;
        const qty = Math.floor(totalAvail / (d.price * (1 + getTotalFeeRate())));
        const cost = qty * d.price * (1 + getTotalFeeRate());
        bnhHoldings = qty;
        bnhCash = totalAvail - cost;
        divs = initDivisions(0); // 분할 비움
        transitionNote = `→B&H: ${qty}주 매수@$${d.price.toFixed(2)}, 잔금$${bnhCash.toFixed(0)}`;
      } else if (newStratMode === 'dongpa') {
        // B&H → Dongpa: 전량 매도 후 분할 재배분
        const proceeds = bnhHoldings * d.price * (1 - getTotalFeeRate()) + bnhCash;
        bnhHoldings = 0;
        bnhCash = 0;
        divs = initDivisions(proceeds);
        nextDivIdx = 0;
        transitionNote = `→동파법: $${proceeds.toFixed(0)} 재배분`;
      } else {
        // → Cash: 전량 청산, 현금 보유
        const fromBnh = bnhHoldings * d.price * (1 - getTotalFeeRate()) + bnhCash;
        const fromDivs = liquidateDivisions(divs, d.price);
        bnhHoldings = 0;
        bnhCash = fromBnh + fromDivs;
        divs = initDivisions(0);
        transitionNote = `→현금: $${bnhCash.toFixed(0)} 보유`;
      }
      stratMode = newStratMode;
    }

    divRsiMode = rsiMode;
    stepCount++;

    // ── B&H 모드 운영 ─────────────────────────────────────
    let bnhValue = 0;
    if (stratMode === 'bnh') {
      bnhValue = bnhHoldings * d.price + bnhCash;
    } else if (stratMode === 'cash') {
      bnhValue = bnhCash;
    }

    // ── 동파법 모드 운영 ──────────────────────────────────
    let divValue = 0;
    if (stratMode === 'dongpa') {
      // 리밸런싱
      if (stepCount > 1 && stepCount % RP === 0) {
        divs = rebalanceDivisions(divs, d.price);
      }

      // 분할 상태 업데이트
      const cfg = getDivConfig();
      divs = divs.map(div => {
        if(div.status==='EMPTY') return {...div, buyLimitPrice:d.price*(1+cfg.buyTarget), sellLimitPrice:0, tradingDaysHeld:0, currentValue:0, unrealizedPL:0, unrealizedPLRate:0};
        const cv=div.holdings*d.price, upl=cv-div.totalCost;
        const td=div.buyDate?calcTradingDays(div.buyDate,d.date):0;
        return {...div, currentValue:cv, unrealizedPL:upl, unrealizedPLRate:div.totalCost>0?(upl/div.totalCost)*100:0,
                buyLimitPrice:d.price*(1+cfg.buyTarget), sellLimitPrice:div.avgPrice*(1+cfg.sellTarget), tradingDaysHeld:td};
      });

      // 다음 빈 분할 찾기
      const emptyIdx = findNextEmpty();
      if(emptyIdx >= 0) nextDivIdx = emptyIdx;

      // 매도 체크
      const toSell: number[] = [];
      for(let j=0; j<divs.length; j++){
        const div=divs[j];
        if(div.status!=='HOLDING'||!div.holdings) continue;
        const td=div.buyDate?calcTradingDays(div.buyDate,d.date):0;
        if(td>=cfg.holdingDays){
          toSell.push(j);
        } else if(d.price>=div.sellLimitPrice&&div.sellLimitPrice>0){
          toSell.push(j);
        }
      }
      for(const j of toSell){
        const div=divs[j];
        const sellPrice=d.price>=div.sellLimitPrice&&divs[j].tradingDaysHeld<cfg.holdingDays?div.sellLimitPrice:d.price;
        const proceeds=div.holdings*sellPrice*(1-getTotalFeeRate());
        divs[j]={...div,status:'EMPTY',cash:proceeds,holdings:0,avgPrice:0,buyDate:'',buyPrice:0,totalCost:0,currentValue:0,unrealizedPL:0,unrealizedPLRate:0,buyLimitPrice:0,sellLimitPrice:0,tradingDaysHeld:0};
      }

      // 매수 체크 (다음 빈 분할 1개)
      const buyIdx = findNextEmpty();
      if(buyIdx >= 0 && prevClose && divRsiMode !== 'cash') {
        const div=divs[buyIdx];
        if(div.divisionNumber===nextDivIdx+1||true){ // 순서 체크 완화
          const chg=(d.price-prevClose)/prevClose;
          if(div.divisionNumber-1===buyIdx && chg<=cfg.buyTarget && div.cash>=MIN_CASH){
            const qty=Math.floor(div.cash/(d.price*(1+getTotalFeeRate())));
            if(qty>0){
              const cost=qty*d.price*(1+getTotalFeeRate());
              divs[buyIdx]={...div,status:'HOLDING',cash:div.cash-cost,holdings:qty,
                avgPrice:d.price,buyDate:d.date,buyPrice:d.price,totalCost:cost,
                currentValue:qty*d.price,unrealizedPL:-cost*getTotalFeeRate(),unrealizedPLRate:-getTotalFeeRate()*100,
                buyLimitPrice:d.price*(1+cfg.buyTarget),sellLimitPrice:d.price*(1+cfg.sellTarget),tradingDaysHeld:0};
              nextDivIdx=(buyIdx+1)%DIV;
            }
          }
        }
      }

      divValue=divs.reduce((s,div)=>s+div.cash+(div.status==='HOLDING'?div.holdings*d.price:0),0);
    }

    const totalAssets = stratMode==='bnh' ? bnhValue : stratMode==='cash' ? bnhCash : divValue;
    results.push({
      date:d.date, strategyMode:stratMode, rsiMode, totalAssets,
      returnRate:((totalAssets-IC)/IC)*100,
      bnhHoldings, bnhCash, divisionAssets:divValue, transitioned, transitionNote
    });
  }
  return results;
}

function calcStats(records: DayResult[], data: MarketData[]) {
  if(!records.length) return null;
  const last=records[records.length-1];
  let peak=IC, mdd=0;
  for(const r of records){if(r.totalAssets>peak)peak=r.totalAssets; const dd=(peak-r.totalAssets)/peak*100; if(dd>mdd)mdd=dd;}
  const bnh=((data[data.length-1].price-data[0].price)/data[0].price)*100;
  const transitions=records.filter(r=>r.transitioned).length;
  const bnhDays=records.filter(r=>r.strategyMode==='bnh').length;
  const dongpaDays=records.filter(r=>r.strategyMode==='dongpa').length;
  const cashDays=records.filter(r=>r.strategyMode==='cash').length;
  return {ret:((last.totalAssets-IC)/IC)*100, mdd, bnh, transitions, bnhDays, dongpaDays, cashDays, total:records.length};
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

// 동파법 단독 (v3.1) 연도별 결과 — 비교용
function runDongpaOnly(data: MarketData[], modeMap: Map<string,ModeKey>): number {
  let divs = initDivisions(IC);
  let nextIdx = 0;
  let rsiMode: ModeKey = 'safe';
  let stepCount = 0;

  for(let i=0; i<data.length; i++){
    const d=data[i], prevClose=i>0?data[i-1].price:null;
    const m=modeMap.get(d.date); if(m) rsiMode=m;
    const cfg=DONGPA_CONFIGS[rsiMode==='cash'?'safe':rsiMode];
    stepCount++;
    if(stepCount>1&&stepCount%RP===0) divs=rebalanceDivisions(divs,d.price);
    divs=divs.map(div=>{
      if(div.status==='EMPTY') return {...div,buyLimitPrice:d.price*(1+cfg.buyTarget),sellLimitPrice:0,tradingDaysHeld:0,currentValue:0,unrealizedPL:0,unrealizedPLRate:0};
      const cv=div.holdings*d.price, td=div.buyDate?calcTradingDays(div.buyDate,d.date):0;
      return {...div,currentValue:cv,unrealizedPL:cv-div.totalCost,unrealizedPLRate:div.totalCost>0?((cv-div.totalCost)/div.totalCost)*100:0,buyLimitPrice:d.price*(1+cfg.buyTarget),sellLimitPrice:div.avgPrice*(1+cfg.sellTarget),tradingDaysHeld:td};
    });
    const toSell: number[]=[];
    for(let j=0;j<divs.length;j++){
      const div=divs[j];
      if(div.status!=='HOLDING'||!div.holdings) continue;
      const td=div.buyDate?calcTradingDays(div.buyDate,d.date):0;
      if(td>=cfg.holdingDays||d.price>=div.sellLimitPrice&&div.sellLimitPrice>0) toSell.push(j);
    }
    for(const j of toSell){
      const div=divs[j];
      const sp=d.price>=div.sellLimitPrice&&div.tradingDaysHeld<cfg.holdingDays?div.sellLimitPrice:d.price;
      divs[j]={...div,status:'EMPTY',cash:div.holdings*sp*(1-getTotalFeeRate()),holdings:0,avgPrice:0,buyDate:'',buyPrice:0,totalCost:0,currentValue:0,unrealizedPL:0,unrealizedPLRate:0,buyLimitPrice:0,sellLimitPrice:0,tradingDaysHeld:0};
    }
    for(let j=0;j<divs.length;j++){
      const idx=(nextIdx+j)%divs.length;
      if(divs[idx].status==='EMPTY'){nextIdx=idx;break;}
    }
    const div=divs[nextIdx];
    if(prevClose&&rsiMode!=='cash'&&div.status==='EMPTY'&&div.cash>=MIN_CASH){
      const chg=(d.price-prevClose)/prevClose;
      if(chg<=cfg.buyTarget){
        const qty=Math.floor(div.cash/(d.price*(1+getTotalFeeRate())));
        if(qty>0){
          const cost=qty*d.price*(1+getTotalFeeRate());
          divs[nextIdx]={...div,status:'HOLDING',cash:div.cash-cost,holdings:qty,avgPrice:d.price,buyDate:d.date,buyPrice:d.price,totalCost:cost,currentValue:qty*d.price,unrealizedPL:-cost*getTotalFeeRate(),unrealizedPLRate:-getTotalFeeRate()*100,buyLimitPrice:d.price*(1+cfg.buyTarget),sellLimitPrice:d.price*(1+cfg.sellTarget),tradingDaysHeld:0};
          nextIdx=(nextIdx+1)%DIV;
        }
      }
    }
  }
  const totalAssets=divs.reduce((s,div)=>s+div.cash+(div.status==='HOLDING'?div.holdings*data[data.length-1].price:0),0);
  return ((totalAssets-IC)/IC)*100;
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

  type Row={year:number;days:number;hybrid:number;dongpa:number;bnh:number;mdd:number;
            transitions:number;bnhPct:number;dongpaPct:number;cashPct:number};
  const rows: Row[]=[];

  for(let year=startYear;year<=endYear;year++){
    const start=`${year}-01-01`, end=`${year}-12-31`;
    const yearData=rawData.filter(d=>d.date>=start&&d.date<=end);
    if(yearData.length<10) continue;

    const hybridRecs=runHybrid(yearData,allModeMap);
    const s=calcStats(hybridRecs,yearData);
    const dongpaRet=runDongpaOnly(yearData,allModeMap);
    if(!s) continue;

    rows.push({
      year, days:yearData.length,
      hybrid:s.ret, dongpa:dongpaRet, bnh:s.bnh, mdd:s.mdd,
      transitions:s.transitions,
      bnhPct:Math.round(s.bnhDays/s.total*100),
      dongpaPct:Math.round(s.dongpaDays/s.total*100),
      cashPct:Math.round(s.cashDays/s.total*100),
    });
  }

  // ── 출력 ──────────────────────────────────────────────────────
  const W=115;
  console.log('='.repeat(W));
  console.log('  하이브리드 전략 (B&H + 동파법) 연도별 비교');
  console.log('  상승장 (aggressive/bull RSI) → B&H | 하락장 (safe/cash RSI) → 동파법v3.1');
  console.log('='.repeat(W));
  const h=(s:string,w:number)=>s.padEnd(w);
  const f=(v:number)=>(v>=0?'+':'')+v.toFixed(1)+'%';
  const mark=(a:number,b:number,c:number)=>{const best=Math.max(a,b,c);return a===best?'★':' ';};

  console.log(h('  연도',7)+h('일수',5)+h('하이브리드',12)+h('동파v3.1',11)+h('B&H',9)+
              h('MDD',9)+h('전환',5)+h('B&H일%',8)+h('동파일%',9)+h('현금일%',8));
  console.log('-'.repeat(W));

  let tHybrid=1, tDongpa=1, tBnh=1;
  for(const r of rows){
    const m=mark(r.hybrid,r.dongpa,r.bnh);
    const winner=r.hybrid>r.dongpa&&r.hybrid>r.bnh?'하이브리드':r.bnh>r.dongpa&&r.bnh>r.hybrid?'B&H':'동파법';
    console.log(
      h('  '+r.year,7)+h(String(r.days),5)+
      h(m+f(r.hybrid),12)+h(f(r.dongpa),11)+h(f(r.bnh),9)+
      h('-'+r.mdd.toFixed(1)+'%',9)+h(String(r.transitions),5)+
      h(r.bnhPct+'%',8)+h(r.dongpaPct+'%',9)+h(r.cashPct+'%',8)
    );
    tHybrid*=(1+r.hybrid/100); tDongpa*=(1+r.dongpa/100); tBnh*=(1+r.bnh/100);
  }

  console.log('-'.repeat(W));
  const [cH,cD,cB]=[(tHybrid-1)*100,(tDongpa-1)*100,(tBnh-1)*100];
  const m=mark(cH,cD,cB);
  console.log(h('  누적',7)+h('',5)+h(m+f(cH),12)+h(f(cD),11)+h(f(cB),9));
  console.log('='.repeat(W));

  // ── 구간별 요약 ────────────────────────────────────────────────
  const periods=[
    {label:'하락/폭락 (2011,18,22)',years:[2011,2018,2022]},
    {label:'강한상승 (2013,17,19,23)',years:[2013,2017,2019,2023]},
    {label:'학습 (2022~24)',years:[2022,2023,2024]},
    {label:'검증 (2025)',years:[2025]},
    {label:'전체 (2010~)',years:[]},
  ];
  console.log('\n구간별 요약:');
  console.log('  '+['구간','하이브리드','동파v3.1','B&H','승자'].map((s,i)=>[20,12,12,12,10][i]?s.padEnd([20,12,12,12,10][i]):s).join(''));
  console.log('  '+'-'.repeat(60));
  for(const p of periods){
    const pr=p.years.length>0
      ?rows.filter(r=>p.years.includes(r.year))
      :rows;
    if(!pr.length) continue;
    let pH=1,pD=1,pB=1;
    for(const r of pr){pH*=(1+r.hybrid/100);pD*=(1+r.dongpa/100);pB*=(1+r.bnh/100);}
    const [rH,rD,rB]=[(pH-1)*100,(pD-1)*100,(pB-1)*100];
    const best=rH>=rD&&rH>=rB?'★하이브리드':rB>=rH&&rB>=rD?'B&H':'동파법';
    console.log(`  ${p.label.padEnd(22)}${f(rH).padEnd(12)}${f(rD).padEnd(12)}${f(rB).padEnd(12)}${best}`);
  }

  // ── 연도별 승자 집계 ────────────────────────────────────────────
  const [hWins,dWins,bWins]=[
    rows.filter(r=>r.hybrid>r.dongpa&&r.hybrid>r.bnh).length,
    rows.filter(r=>r.dongpa>r.hybrid&&r.dongpa>r.bnh).length,
    rows.filter(r=>r.bnh>r.hybrid&&r.bnh>r.dongpa).length,
  ];
  console.log(`\n연도별 최고 전략 (${rows.length}년): 하이브리드 ${hWins}년 | 동파v3.1 ${dWins}년 | B&H ${bWins}년`);
}

main().catch(console.error);
