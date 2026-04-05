/**
 * 하이브리드 최종 비교: B&H + 동파법 (비대칭 필터 포함)
 * npx tsx --tsconfig tsconfig.json scripts/hybrid-final.ts
 *
 * 비교 대상:
 *   dongpa   : 동파법 v3.1 단독
 *   bnh      : B&H 단독 (참고용)
 *   hybrid0  : 기본 하이브리드 (필터 없음)
 *   hybrid1  : + 최소보유 10일 (양방향 lock)
 *   hybrid2  : + SMA50 (진입만 차단)
 *   hybrid3  : + 비대칭 (진입: SMA50 + 10일 대기 / 탈출: 즉시)  ← 최종 권장
 *
 * 비대칭 로직:
 *   B&H 진입(dongpa→bnh): RSI bull/aggr AND 가격>SMA50 AND 전환후 10일 경과
 *   B&H 탈출(bnh→dongpa): RSI safe/cash → 즉시 (빠른 위험 회피)
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
const N_DIV = 10, REBAL = 10, MIN_HOLD = 10, SMA_P = 50;

// ── 유틸 ──────────────────────────────────────────────────────
function tradingDays(from: string, to: string): number {
  const p = (s: string) => { const [y,m,d]=s.split('-').map(Number); return Date.UTC(y,m-1,d); };
  const [s,e] = [p(from),p(to)];
  if (s>e) return 0;
  const total = Math.floor((e-s)/86400000)+1;
  let n = Math.floor(total/7)*5;
  const dow0 = new Date(s).getUTCDay();
  for (let i=0;i<total%7;i++){const d=(dow0+i)%7; if(d&&d!==6) n++;}
  return n;
}
function weekNum(dt: Date): number {
  const d = new Date(Date.UTC(dt.getFullYear(),dt.getMonth(),dt.getDate()));
  const day = d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-day);
  const y = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d.getTime()-y.getTime())/86400000)+1)/7);
}
function computeRsiModes(all: MarketData[]): Map<string,ModeKey> {
  const weeks: Record<string,MarketData[]>={};
  for (const d of all) {
    const dt=new Date(d.date);
    const k=`${dt.getFullYear()}-W${String(weekNum(dt)).padStart(2,'0')}`;
    (weeks[k]??=[]).push(d);
  }
  const weekly = Object.keys(weeks).sort().map(k => {
    const w=weeks[k]; return w.find(d=>new Date(d.date).getDay()===5)??w[w.length-1];
  });
  const P=14;
  const px=weekly.map(d=>d.price);
  const rsi:(number|null)[]=new Array(px.length).fill(null);
  let ag=0,al=0;
  for(let i=1;i<=P;i++){const c=px[i]-px[i-1];c>0?ag+=c:al+=Math.abs(c);}
  ag/=P;al/=P;
  rsi[P]=al===0?100:100-100/(1+ag/al);
  for(let i=P+1;i<px.length;i++){
    const c=px[i]-px[i-1];
    ag=(ag*(P-1)+(c>0?c:0))/P;al=(al*(P-1)+(c<0?Math.abs(c):0))/P;
    rsi[i]=al===0?100:100-100/(1+ag/al);
  }
  const rm=new Map(weekly.map((w,i)=>[w.date,{r:rsi[i],p:i>0?rsi[i-1]:null}]));
  let last:ModeKey='safe';
  const out=new Map<string,ModeKey>();
  for(const d of all){
    const w=rm.get(d.date);
    if(w?.r!=null&&w.p!=null){
      const[c,pv,up,dn]=[w.r,w.p,w.r>w.p,w.r<w.p];
      if(dn&&c<40)last='cash';
      else if(dn||(pv>=50&&c<50)||c>65)last='safe';
      else if(c>=55&&c<=65&&up)last='bull';
      else if(up||(pv<50&&c>=50))last='aggressive';
    }
    out.set(d.date,last);
  }
  return out;
}
function computeSMA(all: MarketData[], period: number): Map<string,number> {
  const out=new Map<string,number>();
  for(let i=period-1;i<all.length;i++){
    out.set(all[i].date, all.slice(i-period+1,i+1).reduce((s,d)=>s+d.price,0)/period);
  }
  return out;
}

// ── 분할 엔진 ──────────────────────────────────────────────────
const makeDivs=(cash:number):Division[]=>Array.from({length:N_DIV},(_,i)=>({
  n:i+1,status:'EMPTY' as const,cash:cash/N_DIV,shares:0,avgPrice:0,
  buyDate:'',totalCost:0,sellTarget:0,holdingDays:0
}));
const divValue=(divs:Division[],price:number)=>divs.reduce((s,d)=>s+d.cash+(d.status==='HOLDING'?d.shares*price:0),0);
const liquidate=(divs:Division[],price:number)=>divs.reduce((s,d)=>
  d.status==='HOLDING'?s+d.shares*price*(1-FEE):s+d.cash,0);

function rebalDivs(divs:Division[],price:number):Division[]{
  const tc=divs.reduce((s,d)=>s+d.cash,0),ts=divs.reduce((s,d)=>s+(d.status==='HOLDING'?d.shares*price:0),0);
  const tgt=(tc+ts)/N_DIV;
  let need=0;
  const ns=divs.map(d=>{if(d.status!=='HOLDING')return 0;const n=Math.max(0,tgt-d.shares*price);need+=n;return n;});
  const sc=need>0?Math.min(1,tc/need):1;
  const rem=tc-ns.reduce((s,n)=>s+n*sc,0);
  const ec=divs.filter(d=>d.status==='EMPTY').length,cpe=ec>0?rem/ec:0;
  return divs.map((d,i)=>d.status==='HOLDING'
    ?{...d,cash:ns[i]*sc}
    :{...d,cash:cpe,shares:0,avgPrice:0,buyDate:'',totalCost:0,sellTarget:0,holdingDays:0,status:'EMPTY' as const});
}

function stepDivs(divs:Division[],nextIdx:number,date:string,price:number,prev:number|null,mode:ModeKey,step:number):{divs:Division[];nextIdx:number}{
  const cfg=CONFIGS[mode==='cash'?'safe':mode];
  if(step>0&&step%REBAL===0) divs=rebalDivs(divs,price);
  divs=divs.map(d=>{
    if(d.status!=='HOLDING')return d;
    const td=d.buyDate?tradingDays(d.buyDate,date):0;
    const hit=price>=d.sellTarget&&d.sellTarget>0;
    const exp=td>=d.holdingDays;
    if(hit||exp){
      const sp=hit&&!exp?d.sellTarget:price;
      return{...d,status:'EMPTY' as const,cash:d.shares*sp*(1-FEE),shares:0,avgPrice:0,buyDate:'',totalCost:0,sellTarget:0,holdingDays:0};
    }
    return d;
  });
  let fi=-1;
  for(let i=0;i<divs.length;i++){const idx=(nextIdx+i)%divs.length;if(divs[idx].status==='EMPTY'){fi=idx;break;}}
  if(fi>=0)nextIdx=fi;
  if(mode!=='cash'&&prev&&fi>=0){
    const d=divs[fi];
    const chg=(price-prev)/prev;
    if(d.cash>=100&&chg<=cfg.buyTarget){
      const qty=Math.floor(d.cash/(price*(1+FEE)));
      if(qty>0){
        const cost=qty*price*(1+FEE);
        divs[fi]={...d,status:'HOLDING' as const,cash:d.cash-cost,shares:qty,avgPrice:price,
          buyDate:date,totalCost:cost,sellTarget:price*(1+cfg.sellTarget),holdingDays:cfg.holdingDays};
        nextIdx=(fi+1)%N_DIV;
      }
    }
  }
  return{divs,nextIdx};
}

// ── 하이브리드 필터 옵션 ──────────────────────────────────────
interface HybridOpts {
  minHoldEntry: number;    // B&H 진입 최소대기일 (0=없음)
  smaEntry: boolean;       // B&H 진입 SMA필터
  minHoldExit: number;     // B&H 탈출 최소대기일 (0=없음, 비대칭이면 0)
}

function runHybrid(yd:MarketData[],modeMap:Map<string,ModeKey>,smaMap:Map<string,number>,opts:HybridOpts){
  let sm:StratMode='dongpa';
  let bnhShares=0,freeCash=IC;
  let divs=makeDivs(IC),nextIdx=0,step=0,daysSince=999;
  let totalAssets=IC;
  let peak=IC,mdd=0;
  let trans=0,bnhDays=0,dpDays=0,cashDays=0;

  for(let i=0;i<yd.length;i++){
    const d=yd[i],prev=i>0?yd[i-1].price:null;
    const rm=modeMap.get(d.date)??'safe';
    daysSince++;

    const wantBnh=rm==='aggressive'||rm==='bull';
    const wantCash=rm==='cash';
    let desired:StratMode=wantBnh?'bnh':wantCash?'cash':'dongpa';

    // 필터: B&H 진입 (dongpa/cash → bnh)
    if(desired==='bnh'&&sm!=='bnh'){
      const lockOk=opts.minHoldEntry===0||daysSince>=opts.minHoldEntry;
      const smaOk=!opts.smaEntry||(()=>{const s=smaMap.get(d.date);return!s||d.price>=s;})();
      if(!lockOk||!smaOk) desired=sm; // 진입 차단
    }
    // 필터: B&H 탈출 (bnh → dongpa/cash) — 비대칭이면 즉시
    if(sm==='bnh'&&desired!=='bnh'){
      const lockOk=opts.minHoldExit===0||daysSince>=opts.minHoldExit;
      if(!lockOk) desired='bnh'; // 탈출 차단 (비대칭이면 이 조건 안 걸림)
    }

    const changed=desired!==sm;
    if(changed){
      daysSince=0; trans++;
      if(desired==='bnh'){
        const cash=liquidate(divs,d.price)+freeCash;
        const qty=Math.floor(cash/(d.price*(1+FEE)));
        bnhShares=qty;freeCash=cash-qty*d.price*(1+FEE);
        divs=makeDivs(0);
      } else if(desired==='dongpa'){
        const cash=bnhShares*d.price*(1-FEE)+freeCash;
        bnhShares=0;freeCash=0;
        divs=makeDivs(cash);nextIdx=0;step=0;
      } else {
        freeCash=bnhShares*d.price*(1-FEE)+liquidate(divs,d.price)+freeCash;
        bnhShares=0;divs=makeDivs(0);
      }
      sm=desired;
    }

    if(sm==='bnh'){
      totalAssets=bnhShares*d.price+freeCash; bnhDays++;
    } else if(sm==='cash'){
      totalAssets=freeCash; cashDays++;
    } else {
      const r=stepDivs(divs,nextIdx,d.date,d.price,prev,rm,step);
      divs=r.divs;nextIdx=r.nextIdx;step++;
      totalAssets=divValue(divs,d.price); dpDays++;
    }
    if(totalAssets>peak)peak=totalAssets;
    const dd=(peak-totalAssets)/peak*100;
    if(dd>mdd)mdd=dd;
  }
  const ret=((totalAssets-IC)/IC)*100;
  const bnh=((yd[yd.length-1].price-yd[0].price)/yd[0].price)*100;
  return{ret,mdd,bnh,trans,
         bnhPct:Math.round(bnhDays/yd.length*100),
         dpPct:Math.round(dpDays/yd.length*100),
         cashPct:Math.round(cashDays/yd.length*100)};
}

async function fetchSOXL():Promise<MarketData[]>{
  const res=await fetch('https://query1.finance.yahoo.com/v8/finance/chart/SOXL?range=6000d&interval=1d',{headers:{'User-Agent':'Mozilla/5.0'}});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  const j=await res.json(),r=j.chart?.result?.[0];
  if(!r)throw new Error('no data');
  const ts:number[]=r.timestamp||[],cl:number[]=r.indicators?.quote?.[0]?.close||[];
  const op:number[]=r.indicators?.quote?.[0]?.open||[],hi:number[]=r.indicators?.quote?.[0]?.high||[];
  const lo:number[]=r.indicators?.quote?.[0]?.low||[],vo:number[]=r.indicators?.quote?.[0]?.volume||[];
  return ts.map((t,i)=>{
    const price=Number((cl[i]||0).toFixed(2)),prev=i>0?(cl[i-1]||price):price;
    return{date:new Date(t*1000).toISOString().split('T')[0],price,
           change:Number((price-prev).toFixed(2)),changePercent:Number(((price-prev)/prev*100).toFixed(2)),
           volume:vo[i]||0,high:Number((hi[i]||price).toFixed(2)),low:Number((lo[i]||price).toFixed(2)),open:Number((op[i]||price).toFixed(2))};
  }).filter(d=>d.price>0);
}

async function main(){
  console.log('SOXL 데이터 로드 중...');
  const raw=await fetchSOXL();
  console.log(`총 ${raw.length}거래일 (${raw[0].date} ~ ${raw[raw.length-1].date})\n`);

  const modeMap=computeRsiModes(raw);
  const smaMap=computeSMA(raw,SMA_P);

  const VARIANTS:[string,HybridOpts][]=[
    ['동파v3.1',   {minHoldEntry:0,smaEntry:false,minHoldExit:0}], // dongpa-only placeholder
    ['기본하이브리드', {minHoldEntry:0,smaEntry:false,minHoldExit:0}],
    ['+최소보유(양방향)',{minHoldEntry:MIN_HOLD,smaEntry:false,minHoldExit:MIN_HOLD}],
    ['+SMA50',     {minHoldEntry:0,smaEntry:true,minHoldExit:0}],
    ['★최종(비대칭)',{minHoldEntry:MIN_HOLD,smaEntry:true,minHoldExit:0}],
  ];

  // 동파법 단독 별도 계산
  function runDongpaOnly(yd:MarketData[]):number{
    let divs=makeDivs(IC),nextIdx=0,step=0;
    for(let i=0;i<yd.length;i++){
      const d=yd[i],prev=i>0?yd[i-1].price:null;
      const rm=modeMap.get(d.date)??'safe';
      const r=stepDivs(divs,nextIdx,d.date,d.price,prev,rm,step);
      divs=r.divs;nextIdx=r.nextIdx;step++;
    }
    return((divValue(divs,yd[yd.length-1].price)-IC)/IC)*100;
  }

  type Row={year:number;days:number;bnh:number;rets:number[];mdds:number[];trans:number[];bnhPcts:number[];cashPcts:number[]};
  const rows:Row[]=[];
  const sy=parseInt(raw[0].date.split('-')[0]),ey=parseInt(raw[raw.length-1].date.split('-')[0]);

  for(let yr=sy;yr<=ey;yr++){
    const[s,e]=[`${yr}-01-01`,`${yr}-12-31`];
    const yd=raw.filter(d=>d.date>=s&&d.date<=e);
    if(yd.length<10) continue;
    const rets:number[]=[runDongpaOnly(yd)];
    const mdds:number[]=[0],trans:number[]=[0],bnhPcts:number[]=[0],cashPcts:number[]=[0];
    let bnh=0;
    for(let vi=1;vi<VARIANTS.length;vi++){
      const st=runHybrid(yd,modeMap,smaMap,VARIANTS[vi][1]);
      rets.push(st.ret);mdds.push(st.mdd);trans.push(st.trans);
      bnhPcts.push(st.bnhPct);cashPcts.push(st.cashPct);
      bnh=st.bnh;
    }
    // dongpa mdd
    rows.push({year:yr,days:yd.length,bnh,rets,mdds,trans,bnhPcts,cashPcts});
  }

  // ── 출력 ──────────────────────────────────────────────────────
  const f=(v:number)=>(v>=0?'+':'')+v.toFixed(1)+'%';
  const W=140;
  console.log('='.repeat(W));
  console.log('  최종 비교: 동파v3.1 / 기본하이브리드 / +최소보유 / +SMA50 / ★최종(비대칭 진입만 필터)');
  console.log('  비대칭 로직: 진입(SMA50+10일대기) / 탈출(즉시)');
  console.log('='.repeat(W));

  const cols=['동파v3.1','기본하이브','최소보유','SMA50','★최종'];
  console.log('  '+['연도','일수',...cols,'B&H','MDD기본','MDD최종','전환기본','전환최종']
    .map((s,i)=>s.padEnd([6,5,10,11,10,9,10,10,9,11,10][i]??9)).join(''));
  console.log('-'.repeat(W));

  const totals=VARIANTS.map(()=>1);let totBnh=1;
  for(const r of rows){
    if(r.rets.length<5) continue;
    const best=Math.max(...r.rets,r.bnh);
    const mk=(v:number)=>v===best?'★':' ';
    console.log(
      '  '+String(r.year).padEnd(6)+String(r.days).padEnd(5)+
      r.rets.map((v,i)=>(mk(v)+f(v)).padEnd(i===0?10:i===1?11:i===2?10:i===3?9:10)).join('')+
      f(r.bnh).padEnd(10)+
      ('-'+r.mdds[1].toFixed(1)+'%').padEnd(9)+('-'+r.mdds[4].toFixed(1)+'%').padEnd(11)+
      String(r.trans[1]).padEnd(10)+String(r.trans[4])
    );
    r.rets.forEach((v,i)=>totals[i]*=(1+v/100));
    totBnh*=(1+r.bnh/100);
  }
  console.log('-'.repeat(W));
  const cr=totals.map(t=>(t-1)*100),cb=(totBnh-1)*100;
  const bestC=Math.max(...cr,cb);
  console.log('  누적   '+cr.map((v,i)=>((v===bestC?'★':' ')+f(v)).padEnd(i===0?10:i===1?11:i===2?10:i===3?9:10)).join('')+f(cb));
  console.log('='.repeat(W));

  // ── 구간별 ─────────────────────────────────────────────────────
  const periods=[
    {l:'하락장 (2011,18,22)',    yrs:[2011,2018,2022]},
    {l:'상승장 (2013,17,19,23)', yrs:[2013,2017,2019,2023]},
    {l:'혼합장 (2015,20,24)',    yrs:[2015,2020,2024]},
    {l:'학습 (2022~24)',         yrs:[2022,2023,2024]},
    {l:'검증 (2025)',            yrs:[2025]},
    {l:'전체 (2010~현재)',       yrs:[]},
  ];
  console.log('\n구간별 누적 수익률:');
  console.log('  '+['구간','동파v3.1','기본하이브','최소보유','SMA50','★최종','B&H'].map((s,i)=>s.padEnd([22,11,12,10,9,10,10][i])).join(''));
  console.log('  '+'-'.repeat(90));
  for(const p of periods){
    const pr=p.yrs.length?rows.filter(r=>p.yrs.includes(r.year)):rows;
    if(!pr.length) continue;
    const acc=VARIANTS.map(()=>1);let ab=1;
    for(const r of pr){r.rets.forEach((v,i)=>acc[i]*=(1+v/100));ab*=(1+r.bnh/100);}
    const rv=acc.map(a=>(a-1)*100),rb=(ab-1)*100;
    const allV=[...rv,rb],bestV=Math.max(...allV);
    console.log('  '+p.l.padEnd(22)+rv.map((v,i)=>((v===bestV?'★':' ')+f(v)).padEnd(i===0?11:i===1?12:i===2?10:i===3?9:10)).join('')+(rb===bestV?'★':' ')+f(rb));
  }

  // ── 연도별 최고 ──────────────────────────────────────────────────
  console.log('\n연도별 최고 전략 ('+rows.length+'년):');
  const wc=new Array(VARIANTS.length+1).fill(0);
  for(const r of rows){
    if(r.rets.length<5) continue;
    const all=[...r.rets,r.bnh];
    const bi=all.indexOf(Math.max(...all));
    wc[bi]++;
  }
  [...cols,'B&H'].forEach((l,i)=>console.log(`  ${l.padEnd(20)}: ${wc[i]}년`));

  // ── 최종 버전 핵심 지표 ────────────────────────────────────────
  console.log('\n─── ★최종(비대칭) 핵심 지표 ───');
  const scenarios=[
    {l:'하락장 방어 (2011,18,22)',yrs:[2011,2018,2022]},
    {l:'상승장 참여 (2013,17,23)',yrs:[2013,2017,2023]},
    {l:'최근 학습구간 (2022~24)', yrs:[2022,2023,2024]},
    {l:'검증구간 (2025)',          yrs:[2025]},
  ];
  for(const sc of scenarios){
    const pr=rows.filter(r=>sc.yrs.includes(r.year));
    let a0=1,a4=1,ab=1;
    for(const r of pr){a0*=(1+r.rets[0]/100);a4*=(1+r.rets[4]/100);ab*=(1+r.bnh/100);}
    console.log(`  ${sc.l.padEnd(26)} 동파: ${f((a0-1)*100).padEnd(10)} 최종: ${f((a4-1)*100).padEnd(10)} B&H: ${f((ab-1)*100)}`);
  }
}
main().catch(console.error);
