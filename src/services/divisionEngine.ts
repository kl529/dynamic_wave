'use client'

import {
  DongpaConfig,
  MarketData,
  DivisionPortfolio,
  DivisionAction,
  DailyTradeRecord
} from '@/types';
import { getModeConfig, getTotalFeeRate, calculateTradingDays, ModeConfig } from '@/utils/tradingConfig';
import { TRADING } from '@/constants';

type DivisionEngineMode = 'safe' | 'aggressive' | 'bull' | 'cash';
type DivisionEngineConfig = Omit<DongpaConfig, 'mode'> & {
  mode: DivisionEngineMode | 'auto';
  hybrid?: boolean; // B&H + 동파법 하이브리드 모드
};

/**
 * 분할별 독립 운영 매매 엔진
 *
 * 핵심 원칙:
 * 1. 각 분할은 독립적인 포트폴리오로 운영
 * 2. EMPTY 상태 분할만 매수 가능 (순번 기준, HOLDING 분할은 건너뜀)
 * 3. HOLDING 상태 분할은 매도 완료 후 EMPTY로 전환
 * 4. N일마다 전체 현금을 모아서 재분할
 * 5. 같은 날 매수+매도 발생 시 분할 간 퉁치기 (수수료 절감)
 */
export class DivisionEngine {
  private config: DivisionEngineConfig;
  private nextDivisionIndex = 0;
  private activeMode: DivisionEngineMode;
  private customModeConfigs?: Partial<Record<'safe' | 'aggressive' | 'bull' | 'cash', Partial<ModeConfig>>>;

  constructor(
    config: DivisionEngineConfig,
    customModeConfigs?: Partial<Record<'safe' | 'aggressive' | 'bull' | 'cash', Partial<ModeConfig>>>
  ) {
    this.config = config;
    this.activeMode = config.mode === 'aggressive' ? 'aggressive' : 'safe';
    this.customModeConfigs = customModeConfigs;
  }

  /**
   * 커스텀 오버라이드가 있으면 합쳐서 반환, 없으면 기본값 사용
   * cash 모드는 safe 설정을 기반으로 함 (매도 임계값 계산용)
   */
  private getEffectiveModeConfig(mode: DivisionEngineMode): ModeConfig {
    const baseMode = mode === 'cash' ? 'safe' : mode;
    const base = getModeConfig(baseMode);
    const custom = this.customModeConfigs?.[mode];
    if (!custom) return base;
    return { ...base, ...custom };
  }

  private setActiveMode(mode: DivisionEngineMode) {
    this.activeMode = mode;
  }

  private syncModeForDate(date: string, modesByDate?: Map<string, DivisionEngineMode>) {
    if (this.config.mode === 'auto') {
      const resolved = modesByDate?.get(date);
      if (resolved) this.setActiveMode(resolved);
    } else {
      this.setActiveMode(this.config.mode);
    }
  }

  /**
   * 초기 분할 포트폴리오 생성
   */
  public initializeDivisions(): DivisionPortfolio[] {
    this.nextDivisionIndex = 0;
    const divisionAmount = this.config.initialCapital / this.config.divisions;
    const divisions: DivisionPortfolio[] = [];

    for (let i = 1; i <= this.config.divisions; i++) {
      divisions.push({
        divisionName: `분할${i}`,
        divisionNumber: i,
        status: 'EMPTY',
        cash: divisionAmount,
        holdings: 0,
        avgPrice: 0,
        buyDate: '',
        buyPrice: 0,
        totalCost: 0,
        currentValue: 0,
        unrealizedPL: 0,
        unrealizedPLRate: 0,
        buyLimitPrice: 0,
        sellLimitPrice: 0,
        tradingDaysHeld: 0
      });
    }

    return divisions;
  }

  /**
   * 재분할: 전체 현금을 모아서 올바르게 재배분
   *
   * 알고리즘:
   * 1. 모든 분할의 현금을 풀에 모음 (주식은 그대로 유지)
   * 2. HOLDING 분할에 우선 배분: 목표금액 - 보유주식가치 (양수인 경우만)
   * 3. 나머지 현금을 EMPTY 분할에 균등 배분
   *
   * 재분할 전후 총 자산이 항상 동일하게 유지됨.
   */
  public rebalanceDivisions(
    currentDivisions: DivisionPortfolio[],
    currentPrice: number
  ): DivisionPortfolio[] {
    const totalCash = currentDivisions.reduce((sum, div) => sum + div.cash, 0);
    const totalStockValue = currentDivisions.reduce(
      (sum, div) => sum + div.holdings * currentPrice,
      0
    );
    const totalAssets = totalCash + totalStockValue;
    const newDivisionAmount = totalAssets / this.config.divisions;

    // HOLDING 분할별 필요 현금 계산 (목표금액 - 보유주식 가치, 최소 0)
    let totalCashForHolding = 0;
    const holdingCashNeeds: number[] = currentDivisions.map(div => {
      if (div.status !== 'HOLDING') return 0;
      const stockValue = div.holdings * currentPrice;
      const needed = Math.max(0, newDivisionAmount - stockValue);
      totalCashForHolding += needed;
      return needed;
    });

    // 현금 풀이 부족하면 HOLDING 배분 비례 축소
    const holdingScale = totalCashForHolding > 0
      ? Math.min(1, totalCash / totalCashForHolding)
      : 1;

    const actualCashForHolding = holdingCashNeeds.reduce((s, n) => s + n * holdingScale, 0);
    const remainingCash = totalCash - actualCashForHolding;
    const emptyCount = currentDivisions.filter(d => d.status === 'EMPTY').length;
    const cashPerEmpty = emptyCount > 0 ? remainingCash / emptyCount : 0;

    return currentDivisions.map((div, i) => {
      if (div.status === 'HOLDING') {
        return { ...div, cash: holdingCashNeeds[i] * holdingScale };
      }
      return {
        divisionName: div.divisionName,
        divisionNumber: div.divisionNumber,
        status: 'EMPTY' as const,
        cash: cashPerEmpty,
        holdings: 0,
        avgPrice: 0,
        buyDate: '',
        buyPrice: 0,
        totalCost: 0,
        currentValue: 0,
        unrealizedPL: 0,
        unrealizedPLRate: 0,
        buyLimitPrice: 0,
        sellLimitPrice: 0,
        tradingDaysHeld: 0
      };
    });
  }

  /**
   * 분할별 현재 상태 업데이트 (평가금액, 손익 등)
   */
  public updateDivisionStatus(
    divisions: DivisionPortfolio[],
    currentPrice: number,
    currentDate: string
  ): DivisionPortfolio[] {
    const modeConfig = this.getEffectiveModeConfig(this.activeMode);

    return divisions.map(div => {
      if (div.status === 'EMPTY') {
        return {
          ...div,
          buyLimitPrice: currentPrice * (1 + modeConfig.buyTarget),
          sellLimitPrice: 0,
          tradingDaysHeld: 0,
          currentValue: 0,
          unrealizedPL: 0,
          unrealizedPLRate: 0
        };
      }

      const currentValue = div.holdings * currentPrice;
      const unrealizedPL = currentValue - div.totalCost;
      const unrealizedPLRate = div.totalCost > 0
        ? (unrealizedPL / div.totalCost) * 100
        : 0;
      const sellLimitPrice = div.avgPrice * (1 + modeConfig.sellTarget);
      const tradingDaysHeld = div.buyDate
        ? calculateTradingDays(div.buyDate, currentDate)
        : 0;

      return {
        ...div,
        currentValue,
        unrealizedPL,
        unrealizedPLRate,
        buyLimitPrice: currentPrice * (1 + modeConfig.buyTarget),
        sellLimitPrice,
        tradingDaysHeld
      };
    });
  }

  /**
   * 단일 분할 매수 체크
   * LOC (Limit-on-Close): 전일 대비 변동률 ≤ buyTarget이면 종가에 매수
   * buyTarget은 음수 (예: -0.03 = 3% 이상 하락 시 매수)
   *
   * prevClose가 null이면 첫날이므로 매수 안 함.
   * 수량 계산 시 수수료 포함하여 정확한 최대 수량 산출.
   */
  private checkBuySignal(
    division: DivisionPortfolio,
    todayClose: number,
    prevClose: number | null,
    date: string
  ): DivisionAction | null {
    if (prevClose === null) return null;
    if (this.activeMode === 'cash') return null; // 하락장 감지 — 신규 매수 차단
    if (division.status !== 'EMPTY') return null;
    if (!this.isDivisionEligibleForBuy(division)) return null;
    if (division.cash < TRADING.MIN_CASH_FOR_TRADE) return null;

    const changeRate = (todayClose - prevClose) / prevClose;
    const modeConfig = this.getEffectiveModeConfig(this.activeMode);

    if (changeRate > modeConfig.buyTarget) return null;

    const buyLimitPrice = prevClose * (1 + modeConfig.buyTarget);

    // 수수료 포함 최대 매수 수량
    const quantity = Math.floor(division.cash / (todayClose * (1 + getTotalFeeRate())));
    if (quantity === 0) return null;

    const amount = quantity * todayClose;
    const commission = amount * getTotalFeeRate();

    return {
      divisionName: division.divisionName,
      divisionNumber: division.divisionNumber,
      action: 'BUY',
      quantity,
      price: todayClose,
      limitPrice: buyLimitPrice,
      amount,
      commission,
      reason: `매수: 변동률 ${(changeRate * 100).toFixed(2)}% ≤ 목표 ${(modeConfig.buyTarget * 100).toFixed(2)}%`
    };
  }

  private isDivisionEligibleForBuy(division: DivisionPortfolio): boolean {
    return division.divisionNumber === this.nextDivisionIndex + 1;
  }

  private advanceDivisionPointer() {
    this.nextDivisionIndex = (this.nextDivisionIndex + 1) % this.config.divisions;
  }

  /**
   * nextDivisionIndex를 다음 EMPTY 분할로 이동
   * 현재 순번이 HOLDING이면 다음 EMPTY를 찾아 건너뜀
   */
  private advanceToNextEmpty(divisions: DivisionPortfolio[]): void {
    const n = divisions.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.nextDivisionIndex + i) % n;
      if (divisions[idx].status === 'EMPTY') {
        this.nextDivisionIndex = idx;
        return;
      }
    }
    // 모든 분할이 HOLDING → nextDivisionIndex 유지 (매수 불가)
  }

  /**
   * cash 모드 청산: HOLDING 분할을 시장가로 즉시 전량 매도
   */
  private checkCashExitSignal(
    division: DivisionPortfolio,
    todayClose: number,
    date: string
  ): DivisionAction | null {
    if (division.status !== 'HOLDING' || division.holdings === 0) return null;

    const tradingDaysHeld = division.buyDate
      ? calculateTradingDays(division.buyDate, date)
      : 0;
    const amount = division.holdings * todayClose;
    const commission = amount * getTotalFeeRate();
    const profit = amount - division.totalCost - commission;
    const profitRate = (profit / division.totalCost) * 100;

    return {
      divisionName: division.divisionName,
      divisionNumber: division.divisionNumber,
      action: 'STOP_LOSS',
      quantity: division.holdings,
      price: todayClose,
      limitPrice: todayClose,
      amount,
      commission,
      profit,
      profitRate,
      tradingDaysHeld,
      reason: `하락장 감지 — 전량 청산 (시장가 $${todayClose.toFixed(2)})`
    };
  }

  /**
   * 단일 분할 매도 체크
   */
  private checkSellSignal(
    division: DivisionPortfolio,
    todayClose: number,
    date: string
  ): DivisionAction | null {
    if (division.status !== 'HOLDING' || division.holdings === 0) return null;

    const modeConfig = this.getEffectiveModeConfig(this.activeMode);
    const tradingDaysHeld = division.buyDate
      ? calculateTradingDays(division.buyDate, date)
      : 0;

    // 조건 1: 최대 보유기간 초과 → 시장가 손절
    if (tradingDaysHeld >= modeConfig.holdingDays) {
      const amount = division.holdings * todayClose;
      const commission = amount * getTotalFeeRate();
      const profit = amount - division.totalCost - commission;
      const profitRate = (profit / division.totalCost) * 100;

      return {
        divisionName: division.divisionName,
        divisionNumber: division.divisionNumber,
        action: 'STOP_LOSS',
        quantity: division.holdings,
        price: todayClose,
        limitPrice: todayClose,
        amount,
        commission,
        profit,
        profitRate,
        tradingDaysHeld,
        reason: `손절: ${tradingDaysHeld}거래일 ≥ ${modeConfig.holdingDays}거래일 (시장가 $${todayClose.toFixed(2)})`
      };
    }

    // 조건 2: 목표 수익률 도달 → LOC 지정가 매도
    const sellLimitPrice = division.avgPrice * (1 + modeConfig.sellTarget);
    if (todayClose >= sellLimitPrice) {
      const executionPrice = sellLimitPrice;
      const amount = division.holdings * executionPrice;
      const commission = amount * getTotalFeeRate();
      const profit = amount - division.totalCost - commission;
      const profitRate = (profit / division.totalCost) * 100;

      return {
        divisionName: division.divisionName,
        divisionNumber: division.divisionNumber,
        action: 'SELL',
        quantity: division.holdings,
        price: executionPrice,
        limitPrice: sellLimitPrice,
        amount,
        commission,
        profit,
        profitRate,
        tradingDaysHeld,
        reason: `LOC 매도: 지정가 $${sellLimitPrice.toFixed(2)} ≤ 종가 $${todayClose.toFixed(2)} (+${(modeConfig.sellTarget * 100).toFixed(1)}%)`
      };
    }

    return null;
  }

  private executeBuy(
    division: DivisionPortfolio,
    action: DivisionAction,
    date: string
  ): DivisionPortfolio {
    return {
      ...division,
      status: 'HOLDING',
      cash: division.cash - action.amount - action.commission,
      holdings: action.quantity,
      avgPrice: action.price,
      buyDate: date,
      buyPrice: action.price,
      totalCost: action.amount + action.commission
    };
  }

  private executeSell(
    division: DivisionPortfolio,
    action: DivisionAction
  ): DivisionPortfolio {
    return {
      ...division,
      status: 'EMPTY',
      cash: division.cash + action.amount - action.commission,
      holdings: 0,
      avgPrice: 0,
      buyDate: '',
      buyPrice: 0,
      totalCost: 0
    };
  }

  /**
   * 일별 매매 실행 (분할 간 퉁치기 포함)
   *
   * Pass 1: 모든 분할의 매수/매도 신호 수집
   * Pass 2: 분할 간 퉁치기 계산 → 겹치는 수량만큼 수수료 면제 비율 산출
   * Pass 3: 조정된 수수료로 거래 실행 → 절감된 수수료는 수익에 반영
   */
  public processDailyTrade(
    date: string,
    todayClose: number,
    prevClose: number | null,
    currentDivisions: DivisionPortfolio[],
    daysSinceStart: number
  ): DailyTradeRecord {
    const changeRate = prevClose !== null
      ? ((todayClose - prevClose) / prevClose) * 100
      : 0;

    const isRebalanceDay =
      daysSinceStart > 0 && daysSinceStart % this.config.rebalancePeriod === 0;

    let divisions = [...currentDivisions];

    if (isRebalanceDay) {
      divisions = this.rebalanceDivisions(divisions, todayClose);
    }

    divisions = this.updateDivisionStatus(divisions, todayClose, date);

    // 다음 매수 순번을 EMPTY 분할로 이동 (HOLDING이면 건너뜀)
    this.advanceToNextEmpty(divisions);

    // Pass 1: 신호 수집 (하루 1분할 매수)
    type SignalEntry = { divIdx: number; signal: DivisionAction; type: 'buy' | 'sell' };
    const allSignals: SignalEntry[] = [];
    let buyFound = false;

    for (let i = 0; i < divisions.length; i++) {
      const div = divisions[i];

      // cash 모드: 일반 매도 조건 대신 전량 즉시 청산
      const sellSignal = this.activeMode === 'cash'
        ? this.checkCashExitSignal(div, todayClose, date)
        : this.checkSellSignal(div, todayClose, date);
      if (sellSignal) {
        allSignals.push({ divIdx: i, signal: sellSignal, type: 'sell' });
      }

      if (!buyFound) {
        const buySignal = this.checkBuySignal(div, todayClose, prevClose, date);
        if (buySignal) {
          allSignals.push({ divIdx: i, signal: buySignal, type: 'buy' });
          buyFound = true;
        }
      }
    }

    // Pass 2: 퉁치기 계산
    const buyEntries = allSignals.filter(s => s.type === 'buy');
    const sellEntries = allSignals.filter(s => s.type === 'sell');
    const totalBuyQty = buyEntries.reduce((s, b) => s + b.signal.quantity, 0);
    const totalSellQty = sellEntries.reduce((s, s2) => s + s2.signal.quantity, 0);
    const nettedQty = Math.min(totalBuyQty, totalSellQty);

    // 퉁친 수량 비율만큼 수수료 면제
    const buyCommFactor = totalBuyQty > 0
      ? (totalBuyQty - nettedQty) / totalBuyQty
      : 1;
    const sellCommFactor = totalSellQty > 0
      ? (totalSellQty - nettedQty) / totalSellQty
      : 1;

    // Pass 3: 거래 실행
    const divisionActions: DivisionAction[] = [];
    let totalBuyQuantity = 0;
    let totalSellQuantity = 0;
    let dailyRealizedPL = 0;

    for (const { divIdx, signal, type } of allSignals) {
      if (type === 'buy') {
        const commission = signal.commission * buyCommFactor;
        const adjustedSignal: DivisionAction = { ...signal, commission };
        divisionActions.push(adjustedSignal);
        divisions[divIdx] = this.executeBuy(divisions[divIdx], adjustedSignal, date);
        totalBuyQuantity += signal.quantity;
        this.advanceDivisionPointer();
      } else {
        const commission = signal.commission * sellCommFactor;
        // 수수료 절감분을 수익에 반영
        const profit = (signal.profit ?? 0) + (signal.commission - commission);
        const profitRate = divisions[divIdx].totalCost > 0
          ? (profit / divisions[divIdx].totalCost) * 100
          : (signal.profitRate ?? 0);
        const adjustedSignal: DivisionAction = { ...signal, commission, profit, profitRate };
        divisionActions.push(adjustedSignal);
        divisions[divIdx] = this.executeSell(divisions[divIdx], adjustedSignal);
        totalSellQuantity += signal.quantity;
        dailyRealizedPL += profit;
      }
    }

    const totalCash = divisions.reduce((sum, div) => sum + div.cash, 0);
    const totalHoldings = divisions.reduce((sum, div) => sum + div.holdings, 0);
    const totalValue = divisions.reduce((sum, div) => sum + div.currentValue, 0);
    const totalAssets = totalCash + totalValue;
    const returnRate = ((totalAssets - this.config.initialCapital) / this.config.initialCapital) * 100;

    const netQuantity = totalBuyQuantity - totalSellQuantity;
    const isNetted = nettedQty > 0;
    const savedCommission = nettedQty * todayClose * getTotalFeeRate() * 2;
    const actualTradeQuantity = Math.abs(netQuantity);
    const actualTradeType: 'BUY' | 'SELL' | 'NONE' =
      netQuantity > 0 ? 'BUY' : netQuantity < 0 ? 'SELL' : 'NONE';

    return {
      date,
      closePrice: todayClose,
      prevClosePrice: prevClose ?? todayClose,
      changeRate,
      mode: this.activeMode,
      divisionActions,
      divisionPortfolios: divisions,
      totalBuyQuantity,
      totalSellQuantity,
      netQuantity,
      isNetted,
      actualTradeQuantity,
      actualTradeType,
      savedCommission,
      dailyRealizedPL,
      totalCash,
      totalHoldings,
      totalValue,
      totalAssets,
      returnRate,
      isRebalanceDay,
      rebalanceAmount: isRebalanceDay ? totalAssets : undefined
    };
  }

  /**
   * SMA 계산 (단순이동평균)
   */
  private computeSMA(data: MarketData[], period: number): Map<string, number> {
    const out = new Map<string, number>();
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j].price;
      out.set(data[i].date, sum / period);
    }
    return out;
  }

  /**
   * 전체 기간 백테스팅
   * @param historicalData - 과거 시장 데이터 (오름차순 정렬)
   * @param modesByDate - 날짜별 RSI 기반 모드 맵 (auto 모드일 때 사용)
   */
  public backtest(
    historicalData: MarketData[],
    modesByDate?: Map<string, DivisionEngineMode>
  ): DailyTradeRecord[] {
    if (!historicalData || historicalData.length === 0) return [];

    if (this.config.hybrid) {
      return this.backtestHybrid(historicalData, modesByDate);
    }

    const records: DailyTradeRecord[] = [];
    let divisions = this.initializeDivisions();

    historicalData.forEach((dayData, index) => {
      this.syncModeForDate(dayData.date, modesByDate);
      // 첫날은 prevClose 없음 → 매수 안 함
      const prevClose = index > 0 ? historicalData[index - 1].price : null;

      const record = this.processDailyTrade(
        dayData.date,
        dayData.price,
        prevClose,
        divisions,
        index
      );

      records.push(record);
      divisions = record.divisionPortfolios;
    });

    return records;
  }

  /**
   * 하이브리드 백테스팅 (B&H + 동파법)
   *
   * 전략 전환 규칙 (비대칭 필터):
   *   동파→B&H: RSI aggressive/bull AND 가격>SMA50 AND 마지막전환 >=10 거래일
   *   B&H→동파: RSI safe/cash → 즉시
   */
  private backtestHybrid(
    historicalData: MarketData[],
    modesByDate?: Map<string, DivisionEngineMode>
  ): DailyTradeRecord[] {
    const SMA_PERIOD = 50;
    const MIN_HOLD_ENTRY = 10; // B&H 진입 최소 대기 거래일

    const smaMap = this.computeSMA(historicalData, SMA_PERIOD);
    const records: DailyTradeRecord[] = [];

    type StratMode = 'bnh' | 'dongpa';
    let stratMode: StratMode = 'dongpa';
    let bnhShares = 0;
    let bnhFreeCash = 0;
    let daysSinceSwitch = 999; // 충분히 커서 초기엔 진입 허용

    let divisions = this.initializeDivisions();
    let dpStep = 0; // 동파법 스텝 카운터

    for (let i = 0; i < historicalData.length; i++) {
      const dayData = historicalData[i];
      const prevClose = i > 0 ? historicalData[i - 1].price : null;

      this.syncModeForDate(dayData.date, modesByDate);
      const rsiMode = this.activeMode; // safe | aggressive | bull | cash

      daysSinceSwitch++;

      // 전략 모드 결정
      const wantBnh = rsiMode === 'aggressive' || rsiMode === 'bull';
      let desiredStrat: StratMode = wantBnh ? 'bnh' : 'dongpa';

      // B&H 진입 필터 (비대칭 — 진입만 엄격)
      if (desiredStrat === 'bnh' && stratMode !== 'bnh') {
        const lockOk = daysSinceSwitch >= MIN_HOLD_ENTRY;
        const sma = smaMap.get(dayData.date);
        const smaOk = !sma || dayData.price >= sma;
        if (!lockOk || !smaOk) desiredStrat = stratMode; // 진입 차단
      }
      // B&H 탈출: 즉시 (비대칭 — 탈출은 빠르게)

      const switched = desiredStrat !== stratMode;
      if (switched) {
        daysSinceSwitch = 0;

        if (desiredStrat === 'bnh') {
          // 동파→B&H: 분할 전액 청산 후 주식 매수
          const dpCash = divisions.reduce(
            (sum, div) => sum + div.cash + (div.status === 'HOLDING' ? div.holdings * dayData.price * (1 - getTotalFeeRate()) : 0),
            0
          );
          const totalCash = dpCash;
          const qty = Math.floor(totalCash / (dayData.price * (1 + getTotalFeeRate())));
          bnhShares = qty;
          bnhFreeCash = totalCash - qty * dayData.price * (1 + getTotalFeeRate());
          divisions = this.initializeDivisions().map(d => ({ ...d, cash: 0 }));
          dpStep = 0;
        } else {
          // B&H→동파: 주식 전량 매도 후 분할 초기화
          const cash = bnhShares * dayData.price * (1 - getTotalFeeRate()) + bnhFreeCash;
          bnhShares = 0;
          bnhFreeCash = 0;
          divisions = this.initializeDivisions().map((d, idx) => ({
            ...d,
            cash: cash / this.config.divisions
          }));
          dpStep = 0;
        }
        stratMode = desiredStrat;
      }

      let record: DailyTradeRecord;

      if (stratMode === 'bnh') {
        const totalAssets = bnhShares * dayData.price + bnhFreeCash;
        const returnRate = ((totalAssets - this.config.initialCapital) / this.config.initialCapital) * 100;
        const changeRate = prevClose !== null ? ((dayData.price - prevClose) / prevClose) * 100 : 0;

        record = {
          date: dayData.date,
          closePrice: dayData.price,
          prevClosePrice: prevClose ?? dayData.price,
          changeRate,
          mode: rsiMode,
          stratMode: 'bnh',
          divisionActions: [],
          divisionPortfolios: divisions,
          totalBuyQuantity: switched ? bnhShares : 0,
          totalSellQuantity: 0,
          netQuantity: switched ? bnhShares : 0,
          isNetted: false,
          actualTradeQuantity: switched ? bnhShares : 0,
          actualTradeType: switched ? 'BUY' : 'NONE',
          savedCommission: 0,
          dailyRealizedPL: 0,
          totalCash: bnhFreeCash,
          totalHoldings: bnhShares,
          totalValue: bnhShares * dayData.price,
          totalAssets,
          returnRate,
          isRebalanceDay: false
        };
      } else {
        // 동파법 모드
        record = this.processDailyTrade(
          dayData.date,
          dayData.price,
          prevClose,
          divisions,
          dpStep
        );
        record = { ...record, stratMode: 'dongpa' };
        divisions = record.divisionPortfolios;
        dpStep++;
      }

      records.push(record);
    }

    return records;
  }

  /**
   * 오늘의 매매 신호 가져오기 (실시간)
   */
  public getTodaySignals(
    todayClose: number,
    prevClose: number,
    currentDate: string,
    currentDivisions: DivisionPortfolio[]
  ): {
    buySignals: DivisionAction[];
    sellSignals: DivisionAction[];
    divisions: DivisionPortfolio[];
  } {
    this.syncModeForDate(currentDate);
    const divisions = this.updateDivisionStatus(currentDivisions, todayClose, currentDate);
    const buySignals: DivisionAction[] = [];
    const sellSignals: DivisionAction[] = [];

    divisions.forEach(div => {
      const sellSignal = this.checkSellSignal(div, todayClose, currentDate);
      if (sellSignal) sellSignals.push(sellSignal);

      const buySignal = this.checkBuySignal(div, todayClose, prevClose, currentDate);
      if (buySignal) buySignals.push(buySignal);
    });

    return { buySignals, sellSignals, divisions };
  }
}
