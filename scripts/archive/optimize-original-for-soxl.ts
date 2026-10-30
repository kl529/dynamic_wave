/**
 * 원본 전략 파라미터 → SOXL 최적화
 * npx tsx --tsconfig tsconfig.json scripts/optimize-original-for-soxl.ts
 *
 * 목표: 원본의 양수 buyTarget (보합/소폭상승 포함 매수) 철학을
 *       SOXL에 맞게 최적화. buyTarget 범위를 +0.05 ~ -0.05로 넓게 탐색.
 *
 * 평가:
 *   학습: 2022-01-01 ~ 2024-12-31 (폭락 + 상승 + 박스권)
 *   검증: 2025-01-01 ~ 2025-12-31 (out-of-sample)
 *
 * 점수: returnRate - maxDD * 0.5  (수익 극대화 + MDD 페널티)
 */

// ============================
// 타입 / 설정
// ============================
interface MarketData { date: string; price: number; }
interface Div {
  num: number; status: 'EMPTY'|'HOLDING';
  cash: number; holdings: number; avgPrice: number;
  buyDate: string; totalCost: number; cv: number;
}
interface Cfg { buyTarget: number; sellTarget: number; holdingDays: number; }

const FEE = 0.00044 + 0.0000278;
const MIN_CASH = 100;
const IC = 10000;

// ============================
// 거래일 계산
// ============================
function td(s: string, e: string): number {
  const sp=s.split('-').map(Number), ep=e.split('-').map(Number);
  const su=Date.UTC(sp[0],sp[1]-1,sp[2]), eu=Date.UTC(ep[0],ep[1]-1,ep[2]);
  if(su>eu)return 0;
  const tot=Math.floor((eu-su)/86400000)+1, fw=Math.floor(tot/7);
  let t=fw*5;
  const dow=new Date(su).getUTCDay(), rem=tot%7;
  for(let i=0;i<rem;i++){const d=(dow+i)%7;if(d!==0&&d!==6)t++;}
  return t;
}

// ============================
// 주간 RSI 모드맵 빌드
// ============================
function buildModeMap(data: MarketData[]): Map<string,'safe'|'aggressive'> {
  const weeks: Record<string,MarketData[]>={};
  for(const d of data){
    const dt=new Date(d.date);
    const dn=dt.getUTCDay()||7; const dc=new Date(dt); dc.setUTCDate(dc.getUTCDate()+4-dn);
    const ys=new Date(Date.UTC(dc.getUTCFullYear(),0,1));
    const wn=Math.ceil((((dc.getTime()-ys.getTime())/86400000)+1)/7);
    const k=`${dt.getFullYear()}-W${String(wn).padStart(2,'0')}`;
    (weeks[k]??=[]).push(d);
  }
  const weekly=Object.keys(weeks).sort().map(k=>{
    const wd=weeks[k];
    return wd.find(d=>new Date(d.date).getDay()===5)??wd[wd.length-1];
  });
  const P=14, prices=weekly.map(d=>d.price);
  const rsi:(number|null)[]=new Array(prices.length).fill(null);
  let ag=0,al=0;
  for(let i=1;i<=P;i++){const c=prices[i]-prices[i-1];if(c>0)ag+=c;else al+=Math.abs(c);}
  ag/=P;al/=P;
  rsi[P]=al===0?100:100-100/(1+ag/al);
  for(let i=P+1;i<prices.length;i++){
    const c=prices[i]-prices[i-1];
    ag=(ag*(P-1)+(c>0?c:0))/P; al=(al*(P-1)+(c<0?Math.abs(c):0))/P;
    rsi[i]=al===0?100:100-100/(1+ag/al);
  }
  const wmap=new Map(weekly.map((w,i)=>[w.date,{r:rsi[i],p:i>0?rsi[i-1]:null}]));
  let mode:'safe'|'aggressive'='safe';
  const result=new Map<string,'safe'|'aggressive'>();
  for(const d of data){
    const w=wmap.get(d.date);
    if(w&&w.r!==null&&w.p!==null){
      const curr=w.r,prev=w.p,rising=curr>prev,falling=curr<prev;
      if(falling||(prev>=50&&curr<50)||curr>65) mode='safe';
      else if(rising||(prev<50&&curr>=50)||(curr<35&&rising)) mode='aggressive';
    }
    result.set(d.date,mode);
  }
  return result;
}

// ============================
// 백테스트 (초고속 인라인)
// ============================
function backtest(
  data: MarketData[],
  divisions: number,
  rp: number,  // rebalancePeriod
  safeCfg: Cfg,
  aggrCfg: Cfg,
  modeMap: Map<string,'safe'|'aggressive'>
): { ret: number; mdd: number; wins: number; losses: number; stopLoss: number; buyDays: number } {
  const amt=IC/divisions;
  let divs:Div[]=Array.from({length:divisions},(_,i)=>({
    num:i+1,status:'EMPTY',cash:amt,holdings:0,avgPrice:0,buyDate:'',totalCost:0,cv:0
  }));
  let nxt=0,maxA=IC,mdd=0,wins=0,losses=0,sl=0,buyDays=0;

  for(let i=0;i<data.length;i++){
    const d=data[i],pc=i>0?data[i-1].price:null,close=d.price;
    const mode=modeMap.get(d.date)??'safe';
    const cfg=mode==='safe'?safeCfg:aggrCfg;

    // 재분할
    if(i>0&&i%rp===0){
      const tc=divs.reduce((s,dv)=>s+dv.cash,0);
      const ts=divs.reduce((s,dv)=>s+dv.holdings*close,0);
      const target=(tc+ts)/divisions;
      let need=0;
      const needs=divs.map(dv=>{if(dv.status!=='HOLDING')return 0;const n=Math.max(0,target-dv.holdings*close);need+=n;return n;});
      const scale=need>0?Math.min(1,tc/need):1;
      const used=needs.reduce((s,n)=>s+n*scale,0);
      const rem=tc-used,ec=divs.filter(dv=>dv.status==='EMPTY').length,cpe=ec>0?rem/ec:0;
      divs=divs.map((dv,idx)=>dv.status==='HOLDING'?{...dv,cash:needs[idx]*scale}:{...dv,cash:cpe,holdings:0,avgPrice:0,buyDate:'',totalCost:0,cv:0,status:'EMPTY'});
    }

    // 평가금 업데이트
    divs=divs.map(dv=>({...dv,cv:dv.status==='HOLDING'?dv.holdings*close:0}));

    // 다음 EMPTY 찾기
    for(let k=0;k<divisions;k++){const idx=(nxt+k)%divisions;if(divs[idx].status==='EMPTY'){nxt=idx;break;}}

    // 매도 체크
    const sells:{idx:number;qty:number;amt:number;comm:number;profit:number;isSL:boolean}[]=[];
    for(let j=0;j<divisions;j++){
      const dv=divs[j];if(dv.status!=='HOLDING'||!dv.holdings)continue;
      const days=dv.buyDate?td(dv.buyDate,d.date):0;
      const dvMode=modeMap.get(d.date)??'safe';
      const dvCfg=dvMode==='safe'?safeCfg:aggrCfg;
      if(days>=dvCfg.holdingDays){
        const a=dv.holdings*close,c=a*FEE,p=a-dv.totalCost-c;
        sells.push({idx:j,qty:dv.holdings,amt:a,comm:c,profit:p,isSL:true});
      } else {
        const sl2=dv.avgPrice*(1+dvCfg.sellTarget);
        if(close>=sl2){const a=dv.holdings*sl2,c=a*FEE,p=a-dv.totalCost-c;sells.push({idx:j,qty:dv.holdings,amt:a,comm:c,profit:p,isSL:false});}
      }
    }

    // 매수 체크
    let buyIdx=-1,buyQty=0,buyAmt=0,buyComm=0;
    if(pc!==null){
      const chg=(close-pc)/pc;
      const dv=divs[nxt];
      if(dv.status==='EMPTY'&&dv.cash>=MIN_CASH&&chg<=cfg.buyTarget){
        const qty=Math.floor(dv.cash/(close*(1+FEE)));
        if(qty>0){buyIdx=nxt;buyQty=qty;buyAmt=qty*close;buyComm=buyAmt*FEE;buyDays++;}
      }
    }

    // 퉁치기
    const sellQty=sells.reduce((s,sv)=>s+sv.qty,0);
    const netted=Math.min(buyQty,sellQty);
    const bF=buyQty>0?(buyQty-netted)/buyQty:1;
    const sF=sellQty>0?(sellQty-netted)/sellQty:1;

    // 실행
    for(const sv of sells){
      const comm=sv.comm*sF,profit=sv.profit+(sv.comm-comm);
      divs[sv.idx]={...divs[sv.idx],status:'EMPTY',cash:divs[sv.idx].cash+sv.amt-comm,holdings:0,avgPrice:0,buyDate:'',totalCost:0,cv:0};
      if(sv.isSL){sl++;losses++;}else wins++;
    }
    if(buyIdx>=0){
      const comm=buyComm*bF;
      divs[buyIdx]={...divs[buyIdx],status:'HOLDING',cash:divs[buyIdx].cash-buyAmt-comm,holdings:buyQty,avgPrice:close,buyDate:d.date,totalCost:buyAmt+comm,cv:buyQty*close};
      nxt=(nxt+1)%divisions;
    }

    const totalA=divs.reduce((s,dv)=>s+dv.cash+dv.cv,0);
    if(totalA>maxA)maxA=totalA;
    const dd=maxA>0?((maxA-totalA)/maxA)*100:0;
    if(dd>mdd)mdd=dd;
  }

  const finalA=divs.reduce((s,dv)=>s+dv.cash+dv.cv,0);
  return{ret:((finalA-IC)/IC)*100,mdd,wins,losses:losses-sl,stopLoss:sl,buyDays};
}

// ============================
// Yahoo Finance 데이터
// ============================
async function fetchPeriod(start: string, end: string): Promise<MarketData[]> {
  const s=Math.floor(new Date(start).getTime()/1000);
  const e=Math.floor(new Date(end).getTime()/1000);
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/SOXL?period1=${s}&period2=${e}&interval=1d`;
  const res=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  const j=await res.json();
  const r=j.chart?.result?.[0];if(!r)throw new Error('no data');
  const ts:number[]=r.timestamp??[];
  const closes:number[]=r.indicators?.quote?.[0]?.close??[];
  return ts.map((t,i)=>({date:new Date(t*1000).toISOString().split('T')[0],price:Number((closes[i]||0).toFixed(2))})).filter(d=>d.price>0);
}

// ============================
// 메인
// ============================
async function main() {
  console.log('\n=== 원본 전략 파라미터 SOXL 최적화 ===');
  console.log('학습: 2022~2024 | 검증: 2025\n');

  process.stdout.write('데이터 로드 중...');
  const [trainData, valData] = await Promise.all([
    fetchPeriod('2022-01-01', '2024-12-31'),
    fetchPeriod('2025-01-01', '2025-12-31'),
  ]);
  console.log(` 완료 (학습 ${trainData.length}일 / 검증 ${valData.length}일)\n`);

  const trainModeMap = buildModeMap(trainData);
  const valModeMap   = buildModeMap(valData);

  // ============================
  // 탐색 공간
  // ============================
  // buyTarget: 양수(원본 스타일) ~ 음수(현재 스타일) 전 범위 탐색
  const buyTargets  = [+0.05, +0.03, +0.02, +0.01, 0.00, -0.01, -0.02, -0.03, -0.04, -0.05];
  const safeSells   = [0.002, 0.005, 0.008, 0.010, 0.015, 0.020, 0.030];
  const aggrSells   = [0.010, 0.020, 0.025, 0.030, 0.050, 0.080];
  const holdSafe    = [20, 30, 45];
  const holdAggr    = [5, 7, 10, 14];
  const divsCounts  = [7, 10];

  // safe/aggr buyTarget 동일하게 묶어서 탐색 (조합 폭발 방지)
  // safe sellTarget × aggr sellTarget × holdSafe × holdAggr × divisions
  // = 7 × 6 × 3 × 4 × 2 × 10(buy) = 10,080 combinations

  type Row = {
    buyT: number; safeSell: number; aggrSell: number;
    hSafe: number; hAggr: number; div: number;
    trainRet: number; trainMDD: number; trainScore: number;
    valRet: number; valMDD: number; valScore: number;
    trainWins: number; trainSL: number;
  };

  const results: Row[] = [];
  let count = 0;
  const total = buyTargets.length * safeSells.length * aggrSells.length * holdSafe.length * holdAggr.length * divsCounts.length;

  for (const buyT of buyTargets)
  for (const ss of safeSells)
  for (const as of aggrSells)
  for (const hs of holdSafe)
  for (const ha of holdAggr)
  for (const div of divsCounts) {
    count++;
    if (count % 1000 === 0) process.stdout.write(`\r진행: ${count}/${total} (${((count/total)*100).toFixed(0)}%)`);

    const safeCfg: Cfg = { buyTarget: buyT, sellTarget: ss, holdingDays: hs };
    const aggrCfg: Cfg = { buyTarget: buyT, sellTarget: as, holdingDays: ha };

    const train = backtest(trainData, div, 10, safeCfg, aggrCfg, trainModeMap);
    const val   = backtest(valData,   div, 10, safeCfg, aggrCfg, valModeMap);

    // 점수: 수익률 - MDD × 0.5 (수익과 리스크 균형)
    const trainScore = train.ret - train.mdd * 0.5;
    const valScore   = val.ret   - val.mdd   * 0.5;

    results.push({
      buyT, safeSell: ss, aggrSell: as, hSafe: hs, hAggr: ha, div,
      trainRet: train.ret, trainMDD: train.mdd, trainScore,
      valRet: val.ret, valMDD: val.mdd, valScore,
      trainWins: train.wins, trainSL: train.stopLoss
    });
  }

  console.log(`\r완료: ${total}개 조합 평가\n`);

  // 학습 점수 기준 상위 30개 → 검증 결과 확인
  const top30 = results
    .sort((a, b) => b.trainScore - a.trainScore)
    .slice(0, 30);

  console.log('=== TOP 30 (학습 2022~2024 점수 기준) ===\n');
  console.log(
    `${'순위'.padStart(4)} ${'buyT'.padStart(6)} ${'sSell'.padStart(6)} ${'aSell'.padStart(6)} ` +
    `${'hS'.padStart(4)} ${'hA'.padStart(4)} ${'div'.padStart(4)} ` +
    `${'학습수익'.padStart(9)} ${'학습MDD'.padStart(8)} ${'학습점수'.padStart(9)} ` +
    `${'검증수익'.padStart(9)} ${'검증MDD'.padStart(8)} ${'검증점수'.padStart(9)}`
  );
  console.log('─'.repeat(110));

  for (let i = 0; i < top30.length; i++) {
    const r = top30[i];
    const fmt = (n: number) => (n>=0?'+':'')+n.toFixed(1)+'%';
    console.log(
      `${String(i+1).padStart(4)} ` +
      `${(r.buyT*100).toFixed(0).padStart(5)}% ` +
      `${(r.safeSell*100).toFixed(1).padStart(5)}% ` +
      `${(r.aggrSell*100).toFixed(1).padStart(5)}% ` +
      `${String(r.hSafe).padStart(4)} ${String(r.hAggr).padStart(4)} ${String(r.div).padStart(4)} ` +
      `${fmt(r.trainRet).padStart(9)} ${('-'+r.trainMDD.toFixed(1)+'%').padStart(8)} ${fmt(r.trainScore).padStart(9)} ` +
      `${fmt(r.valRet).padStart(9)} ${('-'+r.valMDD.toFixed(1)+'%').padStart(8)} ${fmt(r.valScore).padStart(9)}`
    );
  }

  // buyTarget별 평균 성과 요약
  console.log('\n=== buyTarget별 평균 성과 (학습 2022~2024) ===\n');
  console.log(`${'buyTarget'.padStart(10)} ${'평균수익률'.padStart(10)} ${'평균MDD'.padStart(9)} ${'평균점수'.padStart(9)} ${'조합수'.padStart(7)}`);
  console.log('─'.repeat(50));

  for (const buyT of buyTargets) {
    const group = results.filter(r => r.buyT === buyT);
    const avgRet = group.reduce((s,r)=>s+r.trainRet,0)/group.length;
    const avgMDD = group.reduce((s,r)=>s+r.trainMDD,0)/group.length;
    const avgScore = group.reduce((s,r)=>s+r.trainScore,0)/group.length;
    const sign = buyT >= 0 ? '+' : '';
    console.log(
      `${(sign+(buyT*100).toFixed(0)+'%').padStart(10)} ` +
      `${((avgRet>=0?'+':'')+avgRet.toFixed(1)+'%').padStart(10)} ` +
      `${('-'+avgMDD.toFixed(1)+'%').padStart(9)} ` +
      `${((avgScore>=0?'+':'')+avgScore.toFixed(1)).padStart(9)} ` +
      `${String(group.length).padStart(7)}`
    );
  }

  // 검증 기준 상위 10개 (overfitting 확인)
  console.log('\n=== TOP 10 (검증 2025 점수 기준, overfitting 체크) ===\n');
  const top10val = [...results].sort((a,b)=>b.valScore-a.valScore).slice(0,10);
  for (let i = 0; i < top10val.length; i++) {
    const r = top10val[i];
    const fmt = (n:number)=>(n>=0?'+':'')+n.toFixed(1)+'%';
    const trainRank = top30.findIndex(t=>t===r)+1;
    const trainRankStr = trainRank>0 ? `(학습 ${trainRank}위)` : '(학습 30위 밖)';
    console.log(
      `${i+1}위. buyT=${((r.buyT>=0?'+':'')+(r.buyT*100).toFixed(0)+'%')} ` +
      `safe=${(r.safeSell*100).toFixed(1)}%/${r.hSafe}일 ` +
      `aggr=${(r.aggrSell*100).toFixed(1)}%/${r.hAggr}일 ` +
      `div=${r.div} | 검증 ${fmt(r.valRet)} MDD ${'-'+r.valMDD.toFixed(1)+'%'} ` +
      `점수 ${fmt(r.valScore)} ${trainRankStr}`
    );
  }

  // 현재 v3 기준선
  const v3Safe: Cfg = { buyTarget: -0.04, sellTarget: 0.008, holdingDays: 30 };
  const v3Aggr: Cfg = { buyTarget: -0.05, sellTarget: 0.060, holdingDays: 10 };
  const v3Train = backtest(trainData, 10, 10, v3Safe, v3Aggr, trainModeMap);
  const v3Val   = backtest(valData,   10, 10, v3Safe, v3Aggr, valModeMap);
  const v3TrainScore = v3Train.ret - v3Train.mdd*0.5;
  const v3ValScore   = v3Val.ret   - v3Val.mdd*0.5;

  console.log('\n=== 현재 v3 기준선 (참고) ===');
  console.log(`학습: 수익 ${(v3Train.ret>=0?'+':'')+v3Train.ret.toFixed(1)}% MDD -${v3Train.mdd.toFixed(1)}% 점수 ${(v3TrainScore>=0?'+':'')+v3TrainScore.toFixed(1)}`);
  console.log(`검증: 수익 ${(v3Val.ret>=0?'+':'')+v3Val.ret.toFixed(1)}% MDD -${v3Val.mdd.toFixed(1)}% 점수 ${(v3ValScore>=0?'+':'')+v3ValScore.toFixed(1)}`);
}

main().catch(console.error);
