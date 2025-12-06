'use client'

import {
  DongpaConfig,
  MarketData,
  DivisionPortfolio,
  DivisionAction,
  DailyTradeRecord
} from '@/types';
import { getModeConfig, getTotalFeeRate, calculateTradingDays } from '@/utils/tradingConfig';

type DivisionEngineMode = 'safe' | 'aggressive';
type DivisionEngineConfig = Omit<DongpaConfig, 'mode'> & {
  mode: DivisionEngineMode | 'auto';
};

/**
 * 분할별 독립 운영 매매 엔진
 *
 * 핵심 원칙:
 * 1. 각 분할은 독립적인 포트폴리오로 운영
 * 2. EMPTY 상태 분할만 매수 가능
 * 3. HOLDING 상태 분할은 매도 완료 후 EMPTY로 전환
 * 4. N일마다 전체 자산을 합쳐서 재분할
 */
export class DivisionEngine {
  private config: DivisionEngineConfig;
  private nextDivisionIndex = 0; // 다음 매수에 사용할 분할(0-based)
  private activeMode: DivisionEngineMode;

  constructor(config: DivisionEngineConfig) {
    this.config = config;
    this.activeMode = config.mode === 'aggressive' ? 'aggressive' : 'safe';
  }

  private setActiveMode(mode: DivisionEngineMode) {
    this.activeMode = mode;
  }

  private syncModeForDate(date: string, modesByDate?: Map<string, DivisionEngineMode>) {
    if (this.config.mode === 'auto') {
      const resolved = modesByDate?.get(date);
      if (resolved) {
        this.setActiveMode(resolved);
      }
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
   * 재분할 실행 - N일마다 전체 자산을 합쳐서 균등 재분할
   */
  public rebalanceDivisions(
    currentDivisions: DivisionPortfolio[],
    currentPrice: number
  ): DivisionPortfolio[] {
    // 1. 전체 자산 계산 (현금 + 평가금액)
    const totalCash = currentDivisions.reduce((sum, div) => sum + div.cash, 0);
    const totalValue = currentDivisions.reduce(
      (sum, div) => sum + (div.holdings * currentPrice),
      0
    );
    const totalAssets = totalCash + totalValue;

    // 2. 새로운 분할금액 계산
    const newDivisionAmount = totalAssets / this.config.divisions;

    // 3. 새 분할 포트폴리오 생성
    const rebalancedDivisions: DivisionPortfolio[] = [];

    for (let i = 1; i <= this.config.divisions; i++) {
      const oldDivision = currentDivisions[i - 1];

      // HOLDING 상태인 분할은 보유 유지, 나머지는 현금으로 재분할
      if (oldDivision.status === 'HOLDING') {
        // 보유중인 주식 가치
        const holdingValue = oldDivision.holdings * currentPrice;
        // 남은 현금 = 새 분할금액 - 보유 가치
        const newCash = Math.max(0, newDivisionAmount - holdingValue);

        rebalancedDivisions.push({
          ...oldDivision,
          cash: newCash
        });
      } else {
        // EMPTY 상태는 새 분할금액으로 초기화
        rebalancedDivisions.push({
          divisionName: `분할${i}`,
          divisionNumber: i,
          status: 'EMPTY',
          cash: newDivisionAmount,
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
    }

    return rebalancedDivisions;
  }

  /**
   * 분할별 현재 상태 업데이트 (평가금액, 손익 등)
   */
  public updateDivisionStatus(
    divisions: DivisionPortfolio[],
    currentPrice: number,
    currentDate: string
  ): DivisionPortfolio[] {
    const modeConfig = getModeConfig(this.activeMode);

    return divisions.map(div => {
      if (div.status === 'EMPTY') {
        // 매수 지정가만 계산
        const buyLimitPrice = currentPrice * (1 + modeConfig.buyTarget);

        return {
          ...div,
          buyLimitPrice,
          sellLimitPrice: 0,
          tradingDaysHeld: 0,
          currentValue: 0,
          unrealizedPL: 0,
          unrealizedPLRate: 0
        };
      } else {
        // HOLDING 상태
        const currentValue = div.holdings * currentPrice;
        const unrealizedPL = currentValue - div.totalCost;
        const unrealizedPLRate = (unrealizedPL / div.totalCost) * 100;

        // 매도 지정가 계산
        const sellLimitPrice = div.avgPrice * (1 + modeConfig.sellTarget);

        // 거래일 기준 보유기간
        const tradingDaysHeld = div.buyDate
          ? calculateTradingDays(div.buyDate, currentDate)
          : 0;

        // 매수 지정가 (보유중이어도 표시)
        const buyLimitPrice = currentPrice * (1 + modeConfig.buyTarget);

        return {
          ...div,
          currentValue,
          unrealizedPL,
          unrealizedPLRate,
          buyLimitPrice,
          sellLimitPrice,
          tradingDaysHeld
        };
      }
    });
  }

  /**
   * 단일 분할 매수 체크
   * LOC (Limit-on-Close): 지정가 이상으로 종가가 형성되면 체결
   */
  private checkBuySignal(
    division: DivisionPortfolio,
    todayClose: number,
    prevClose: number,
    date: string
  ): DivisionAction | null {
    const modeConfig = getModeConfig(this.activeMode);

    // EMPTY 상태가 아니면 매수 불가
    if (division.status !== 'EMPTY') {
      return null;
    }

    // 지정된 순번이 아니라면 대기
    if (!this.isDivisionEligibleForBuy(division)) {
      return null;
    }

    // 충분한 현금이 없으면 매수 불가
    if (division.cash < 100) {
      return null;
    }

    // 변동률 계산
    const changeRate = ((todayClose - prevClose) / prevClose);

    // 매수 조건: 변동률 < buyTarget (목표 상승률보다 낮으면 매수)
    // 예: 안전모드(3%) - 전일 대비 +2.9% 상승 or -5% 하락 → 매수
    //     안전모드(3%) - 전일 대비 +3.1% 상승 → 매수 안함
    if (changeRate >= modeConfig.buyTarget) {
      return null; // 변동률이 목표 이상이면 매수 안함
    }

    // 매수 지정가 표시용 (실제로는 변동률로 판단)
    const buyLimitPrice = prevClose * (1 + modeConfig.buyTarget);

    // 체결가는 오늘 종가 (LOC는 종가에 체결됨)
    const executionPrice = todayClose;

    // 실제 매수 가능 수량 계산
    const quantity = Math.floor(division.cash / executionPrice);
    if (quantity === 0) {
      return null;
    }

    const amount = quantity * executionPrice;
    const commission = amount * getTotalFeeRate();

    // 수수료 포함해서 살 수 있는지 확인
    if (division.cash < amount + commission) {
      return null;
    }

    return {
      divisionName: division.divisionName,
      divisionNumber: division.divisionNumber,
      action: 'BUY',
      quantity,
      price: executionPrice,
      limitPrice: buyLimitPrice,
      amount,
      commission,
      reason: `매수: 변동률 ${(changeRate * 100).toFixed(2)}% < 목표 ${(modeConfig.buyTarget * 100).toFixed(2)}%`
    };
  }

  private isDivisionEligibleForBuy(division: DivisionPortfolio): boolean {
    return division.divisionNumber === this.nextDivisionIndex + 1;
  }

  private advanceDivisionPointer() {
    this.nextDivisionIndex = (this.nextDivisionIndex + 1) % this.config.divisions;
  }

  /**
   * 단일 분할 매도 체크
   * LOC (Limit-on-Close): 지정가 이상으로 종가가 형성되면 체결
   */
  private checkSellSignal(
    division: DivisionPortfolio,
    todayClose: number,
    date: string
  ): DivisionAction | null {
    const modeConfig = getModeConfig(this.activeMode);

    // HOLDING 상태가 아니면 매도 불가
    if (division.status !== 'HOLDING' || division.holdings === 0) {
      return null;
    }

    // 거래일 기준 보유기간
    const tradingDaysHeld = division.buyDate
      ? calculateTradingDays(division.buyDate, date)
      : 0;

    // 조건 1: 최대 보유기간 도달 → 손절 (시장가 매도)
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

    // 조건 2: 목표 수익률 도달 → 지정가 매도
    // 매도 지정가 = 평단가 × (1 + 목표수익률)
    // 예: 평단가 $100 → 0.2% 수익 → 지정가 $100.20
    const sellLimitPrice = division.avgPrice * (1 + modeConfig.sellTarget);

    // LOC 체결 조건: 오늘 종가 >= 매도 지정가
    // 예: 오늘 종가 $100.50 >= 지정가 $100.20 → 체결!
    if (todayClose >= sellLimitPrice) {
      // 체결가는 지정가 (LOC는 지정가 이상이면 지정가에 체결)
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

  /**
   * 분할별 매수 실행
   */
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

  /**
   * 분할별 매도 실행
   */
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
   * 분할별 퉁치기 (Netting) 처리
   * 같은 분할에서 매수와 매도가 동시 발생 시 상계 처리
   */
  private netDivisionTrades(
    buySignal: DivisionAction | null,
    sellSignal: DivisionAction | null
  ): {
    netAction: DivisionAction | null;
    shouldBuy: boolean;
    shouldSell: boolean;
  } {
    // 둘 다 없으면 아무것도 안 함
    if (!buySignal && !sellSignal) {
      return { netAction: null, shouldBuy: false, shouldSell: false };
    }

    // 매수만 있음
    if (buySignal && !sellSignal) {
      return { netAction: buySignal, shouldBuy: true, shouldSell: false };
    }

    // 매도만 있음
    if (!buySignal && sellSignal) {
      return { netAction: sellSignal, shouldBuy: false, shouldSell: true };
    }

    // 둘 다 있음 → 퉁치기!
    if (buySignal && sellSignal) {
      const buyQty = buySignal.quantity;
      const sellQty = sellSignal.quantity;

      // 케이스 1: 매수 > 매도 → 순매수
      if (buyQty > sellQty) {
        const netQty = buyQty - sellQty;
        const netAmount = netQty * buySignal.price;
        const netCommission = netAmount * getTotalFeeRate();

        return {
          netAction: {
            ...buySignal,
            quantity: netQty,
            amount: netAmount,
            commission: netCommission,
            reason: `퉁치기: 매수 ${buyQty}주 - 매도 ${sellQty}주 = 순매수 ${netQty}주`
          },
          shouldBuy: true,
          shouldSell: true  // 기존 포지션 정리
        };
      }
      // 케이스 2: 매도 > 매수 → 순매도
      else if (sellQty > buyQty) {
        const netQty = sellQty - buyQty;
        const netAmount = netQty * sellSignal.price;
        const netCommission = netAmount * getTotalFeeRate();

        // 순매도 시 수익 재계산 (일부만 매도)
        const avgProfit = (sellSignal.profit || 0) / sellQty;
        const netProfit = avgProfit * netQty - netCommission;
        const netProfitRate = sellSignal.profitRate
          ? (sellSignal.profitRate * netQty) / sellQty
          : 0;

        return {
          netAction: {
            ...sellSignal,
            quantity: netQty,
            amount: netAmount,
            commission: netCommission,
            profit: netProfit,
            profitRate: netProfitRate,
            reason: `퉁치기: 매도 ${sellQty}주 - 매수 ${buyQty}주 = 순매도 ${netQty}주`
          },
          shouldBuy: false,
          shouldSell: true
        };
      }
      // 케이스 3: 매수 = 매도 → 퉁쳐서 0 (거래 없음)
      else {
        return {
          netAction: {
            divisionName: buySignal.divisionName,
            divisionNumber: buySignal.divisionNumber,
            action: 'HOLD',
            quantity: 0,
            price: buySignal.price,  // 매수/매도 가격 동일하므로 아무거나 사용
            limitPrice: 0,
            amount: 0,
            commission: 0,
            reason: `퉁치기: 매수 ${buyQty}주 = 매도 ${sellQty}주 (거래 없음, 수수료 절감)`
          },
          shouldBuy: false,
          shouldSell: false
        };
      }
    }

    return { netAction: null, shouldBuy: false, shouldSell: false };
  }

  /**
   * 일별 매매 실행 (모든 분할 체크 + 퉁치기)
   */
  public processDailyTrade(
    date: string,
    todayClose: number,
    prevClose: number,
    currentDivisions: DivisionPortfolio[],
    daysSinceStart: number
  ): DailyTradeRecord {
    const modeConfig = getModeConfig(this.activeMode);
    const changeRate = ((todayClose - prevClose) / prevClose) * 100;

    // 재분할 체크
    const isRebalanceDay =
      daysSinceStart > 0 && daysSinceStart % this.config.rebalancePeriod === 0;

    let divisions = [...currentDivisions];

    // 재분할 실행
    if (isRebalanceDay) {
      divisions = this.rebalanceDivisions(divisions, todayClose);
    }

    // 현재 상태 업데이트
    divisions = this.updateDivisionStatus(divisions, todayClose, date);

    // 각 분할별 매수/매도 체크 + 퉁치기
    const divisionActions: DivisionAction[] = [];
    let totalBuyQuantity = 0;
    let totalSellQuantity = 0;
    let dailyRealizedPL = 0;
    let hasBoughtToday = false; // 분할당 1일 1매수 제한

    divisions = divisions.map(div => {
      // 매도 신호 체크
      const sellSignal = this.checkSellSignal(div, todayClose, date);

      // 매수 신호 체크 (EMPTY일 때만 가능하지만, 퉁치기 위해 항상 체크)
      const buySignal = div.status === 'EMPTY' && !hasBoughtToday
        ? this.checkBuySignal(div, todayClose, prevClose, date)
        : null;

      // 퉁치기 처리
      const { netAction, shouldBuy, shouldSell } = this.netDivisionTrades(
        buySignal,
        sellSignal
      );

        if (netAction) {
          divisionActions.push(netAction);

          // 실제 거래 실행
          if (netAction.action === 'HOLD') {
            // 퉁쳐서 0: 아무것도 안 함
            return div;
          } else if (shouldSell && shouldBuy) {
            // 순매수: 기존 포지션 정리 + 새 매수
            const newDiv = this.executeSell(div, sellSignal!);
            const finalDiv = this.executeBuy(newDiv, netAction, date);
            totalBuyQuantity += netAction.quantity;
            totalSellQuantity += sellSignal!.quantity;
            dailyRealizedPL += sellSignal!.profit || 0;
            hasBoughtToday = true;
            this.advanceDivisionPointer();
            return finalDiv;
          } else if (shouldSell) {
            // 순매도 또는 매도만
            totalSellQuantity += netAction.quantity;
            dailyRealizedPL += netAction.profit || 0;
            return this.executeSell(div, netAction);
          } else if (shouldBuy) {
            // 매수만
            totalBuyQuantity += netAction.quantity;
            hasBoughtToday = true;
            this.advanceDivisionPointer();
            return this.executeBuy(div, netAction, date);
          }
        }

        return div;
    });

    // 전체 자산 계산
    const totalCash = divisions.reduce((sum, div) => sum + div.cash, 0);
    const totalHoldings = divisions.reduce((sum, div) => sum + div.holdings, 0);
    const totalValue = divisions.reduce((sum, div) => sum + div.currentValue, 0);
    const totalAssets = totalCash + totalValue;
    const returnRate = ((totalAssets - this.config.initialCapital) / this.config.initialCapital) * 100;

    const netQuantity = totalBuyQuantity - totalSellQuantity;

    return {
      date,
      closePrice: todayClose,
      prevClosePrice: prevClose,
      changeRate,
      mode: this.activeMode, // 현재 설정된 모드 (RSI 기반으로 변경될 수 있음)
      divisionActions,
      divisionPortfolios: divisions,
      totalBuyQuantity,
      totalSellQuantity,
      netQuantity: Math.abs(netQuantity),
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
   * 전체 기간 백테스팅
   * @param historicalData - 과거 시장 데이터
   * @param modesByDate - 날짜별 RSI 기반 모드 맵 (optional)
   */
  public backtest(
    historicalData: MarketData[],
    modesByDate?: Map<string, DivisionEngineMode>
  ): DailyTradeRecord[] {
    if (!historicalData || historicalData.length === 0) {
      return [];
    }

    const records: DailyTradeRecord[] = [];
    let divisions = this.initializeDivisions();

    historicalData.forEach((dayData, index) => {
      this.syncModeForDate(dayData.date, modesByDate);
      const prevClose = index > 0 ? historicalData[index - 1].price : dayData.price;

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
    // 현재 상태 업데이트
    const divisions = this.updateDivisionStatus(
      currentDivisions,
      todayClose,
      currentDate
    );

    const buySignals: DivisionAction[] = [];
    const sellSignals: DivisionAction[] = [];

    divisions.forEach(div => {
      // 매도 신호
      const sellSignal = this.checkSellSignal(div, todayClose, currentDate);
      if (sellSignal) {
        sellSignals.push(sellSignal);
      }

      // 매수 신호
      const buySignal = this.checkBuySignal(div, todayClose, prevClose, currentDate);
      if (buySignal) {
        buySignals.push(buySignal);
      }
    });

    return { buySignals, sellSignals, divisions };
  }
}
