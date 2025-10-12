'use client'

import { MarketData, DongpaConfig, Trade, TradingSummary, BacktestResult } from '@/types';

export class DongpaCalculator {
  private config: DongpaConfig;
  private fees = {
    commission: 0.00044, // 0.044% 거래 수수료
    secFee: 0.0000278    // SEC 수수료
  };

  constructor(config: DongpaConfig) {
    this.config = config;
  }

  // 모드별 설정
  private get modeConfig() {
    const configs = {
      safe: {
        sellTarget: 0.002,    // 0.2% 수익에서 매도
        buyTarget: 0.03,      // 3.0% 하락에서 매수
        holdingDays: 30       // 평균 보유 기간
      },
      aggressive: {
        sellTarget: 0.025,    // 2.5% 수익에서 매도  
        buyTarget: 0.05,      // 5.0% 하락에서 매수
        holdingDays: 7        // 평균 보유 기간
      }
    };
    
    return configs[this.config.mode];
  }

  private get baseAmount() {
    return this.config.initialCapital / this.config.divisions;
  }

  // 수수료 계산
  private calculateCommission(amount: number): number {
    return amount * (this.fees.commission + this.fees.secFee);
  }

  // 매수 조건 확인
  private shouldBuy(changePercent: number, cash: number): { should: boolean; quantity: number; amount: number } {
    const shouldBuy = Math.abs(changePercent) >= this.modeConfig.buyTarget * 100 && 
                     changePercent < 0 && 
                     cash >= this.baseAmount;

    if (!shouldBuy) {
      return { should: false, quantity: 0, amount: 0 };
    }

    // 현재가 기준으로 매수 수량 계산 (실제로는 현재가가 필요)
    // 여기서는 간단히 baseAmount로 계산
    const quantity = Math.floor(this.baseAmount / (this.baseAmount / 100)); // 임시 계산
    const amount = this.baseAmount;

    return { should: true, quantity, amount };
  }

  // 매도 조건 확인
  private shouldSell(currentPrice: number, avgPrice: number, holdings: number): { should: boolean; profitRate: number } {
    if (holdings <= 0 || avgPrice <= 0) {
      return { should: false, profitRate: 0 };
    }

    const profitRate = (currentPrice - avgPrice) / avgPrice;
    const should = profitRate >= this.modeConfig.sellTarget;

    return { should, profitRate };
  }

  // 백테스팅 실행
  public runBacktest(historicalData: MarketData[]): BacktestResult {
    let portfolio = {
      cash: this.config.initialCapital,
      holdings: 0,
      avgPrice: 0,
      totalCost: 0,
      peakValue: this.config.initialCapital,
      maxDrawdown: 0
    };

    const trades: Trade[] = [];

    historicalData.forEach((dayData, index) => {
      const { price, changePercent } = dayData;
      
      // 매수 신호 확인
      const buySignal = this.shouldBuy(changePercent, portfolio.cash);
      
      // 매도 신호 확인  
      const sellSignal = this.shouldSell(price, portfolio.avgPrice, portfolio.holdings);

      let trade: Trade = {
        key: index,
        date: dayData.date,
        price,
        change: changePercent,
        action: 'HOLD',
        quantity: 0,
        amount: 0,
        commission: 0,
        profit: 0,
        cash: portfolio.cash,
        holdings: portfolio.holdings,
        avgPrice: portfolio.avgPrice,
        currentValue: 0,
        totalAssets: 0,
        returnRate: 0,
        drawdown: 0
      };

      if (buySignal.should) {
        // 매수 실행
        const quantity = Math.floor(this.baseAmount / price);
        const amount = quantity * price;
        const commission = this.calculateCommission(amount);
        
        if (portfolio.cash >= amount + commission) {
          // 평단가 재계산
          const newTotalCost = portfolio.totalCost + amount;
          const newHoldings = portfolio.holdings + quantity;
          
          portfolio.cash -= (amount + commission);
          portfolio.holdings = newHoldings;
          portfolio.totalCost = newTotalCost;
          portfolio.avgPrice = newTotalCost / newHoldings;

          trade.action = 'BUY';
          trade.quantity = quantity;
          trade.amount = amount;
          trade.commission = commission;
        }
      } else if (sellSignal.should) {
        // 매도 실행
        const quantity = portfolio.holdings;
        const amount = quantity * price;
        const commission = this.calculateCommission(amount);
        const profit = amount - portfolio.totalCost - commission;
        
        portfolio.cash += (amount - commission);
        portfolio.holdings = 0;
        portfolio.avgPrice = 0;
        portfolio.totalCost = 0;

        trade.action = 'SELL';
        trade.quantity = quantity;
        trade.amount = amount;
        trade.commission = commission;
        trade.profit = profit;
      }

      // 포트폴리오 현황 계산
      const currentValue = portfolio.holdings * price;
      const totalAssets = portfolio.cash + currentValue;
      
      // MDD 계산
      if (totalAssets > portfolio.peakValue) {
        portfolio.peakValue = totalAssets;
      }
      
      const drawdown = (portfolio.peakValue - totalAssets) / portfolio.peakValue;
      if (drawdown > portfolio.maxDrawdown) {
        portfolio.maxDrawdown = drawdown;
      }

      const returnRate = ((totalAssets - this.config.initialCapital) / this.config.initialCapital) * 100;

      trade.cash = portfolio.cash;
      trade.holdings = portfolio.holdings;
      trade.avgPrice = portfolio.avgPrice;
      trade.currentValue = currentValue;
      trade.totalAssets = totalAssets;
      trade.returnRate = returnRate;
      trade.drawdown = -drawdown * 100;

      trades.push(trade);
    });

    // 요약 통계 계산
    const summary = this.calculateSummary(trades);
    
    return {
      trades,
      portfolio,
      summary
    };
  }

  // 실시간 매매 신호 계산
  public calculateCurrentSignals(recentData: MarketData[]): {
    currentSignal: 'BUY' | 'SELL' | 'HOLD';
    nextBuyPrice: number | null;
    nextSellPrice: number | null;
    cashRemaining: number;
    currentHoldings: number;
    avgPrice: number;
    totalAssets: number;
    returnRate: number;
  } {
    if (!recentData.length) {
      return {
        currentSignal: 'HOLD',
        nextBuyPrice: null,
        nextSellPrice: null,
        cashRemaining: this.config.initialCapital,
        currentHoldings: 0,
        avgPrice: 0,
        totalAssets: this.config.initialCapital,
        returnRate: 0
      };
    }

    // 간단한 시뮬레이션으로 현재 상태 계산
    const backtest = this.runBacktest(recentData);
    const lastTrade = backtest.trades[backtest.trades.length - 1];
    const latestPrice = recentData[recentData.length - 1].price;
    const latestChange = recentData[recentData.length - 1].changePercent;

    // 현재 신호 판단
    let currentSignal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    
    const buySignal = this.shouldBuy(latestChange, lastTrade.cash);
    const sellSignal = this.shouldSell(latestPrice, lastTrade.avgPrice, lastTrade.holdings);
    
    if (buySignal.should) {
      currentSignal = 'BUY';
    } else if (sellSignal.should) {
      currentSignal = 'SELL';
    }

    // 다음 매수가/매도가 계산
    const nextBuyPrice = latestPrice * (1 - this.modeConfig.buyTarget);
    const nextSellPrice = lastTrade.avgPrice > 0 ? 
      lastTrade.avgPrice * (1 + this.modeConfig.sellTarget) : null;

    return {
      currentSignal,
      nextBuyPrice: Number(nextBuyPrice.toFixed(2)),
      nextSellPrice: nextSellPrice ? Number(nextSellPrice.toFixed(2)) : null,
      cashRemaining: lastTrade.cash,
      currentHoldings: lastTrade.holdings,
      avgPrice: lastTrade.avgPrice,
      totalAssets: lastTrade.totalAssets,
      returnRate: lastTrade.returnRate
    };
  }

  // 요약 통계 계산
  private calculateSummary(trades: Trade[]): TradingSummary {
    if (!trades.length) {
      return this.getEmptySummary();
    }

    const buyTrades = trades.filter(t => t.action === 'BUY');
    const sellTrades = trades.filter(t => t.action === 'SELL');
    const profitableTrades = sellTrades.filter(t => t.profit > 0);

    const totalTrades = buyTrades.length + sellTrades.length;
    const winRate = sellTrades.length > 0 ? (profitableTrades.length / sellTrades.length * 100) : 0;

    const avgWin = profitableTrades.length > 0 ? 
      profitableTrades.reduce((sum, t) => sum + t.profit, 0) / profitableTrades.length : 0;
    
    const lossTrades = sellTrades.filter(t => t.profit < 0);
    const avgLoss = lossTrades.length > 0 ?
      lossTrades.reduce((sum, t) => sum + t.profit, 0) / lossTrades.length : 0;

    const totalCommission = trades.reduce((sum, t) => sum + t.commission, 0);
    const finalReturn = trades[trades.length - 1]?.returnRate || 0;
    const maxDrawdown = Math.abs(Math.min(...trades.map(t => t.drawdown)));

    // 샤프 비율 계산
    const returns = trades.map(t => t.returnRate).filter(r => r !== 0);
    let sharpeRatio = 0;
    
    if (returns.length > 1) {
      const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdReturn = Math.sqrt(variance);
      sharpeRatio = stdReturn > 0 ? avgReturn / stdReturn : 0;
    }

    return {
      totalTrades,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      winRate: Number(winRate.toFixed(2)),
      avgWin: Number(avgWin.toFixed(2)),
      avgLoss: Number(avgLoss.toFixed(2)),
      totalCommission: Number(totalCommission.toFixed(2)),
      finalReturn: Number(finalReturn.toFixed(2)),
      maxDrawdown: Number(maxDrawdown.toFixed(2)),
      sharpeRatio: Number(sharpeRatio.toFixed(2))
    };
  }

  private getEmptySummary(): TradingSummary {
    return {
      totalTrades: 0,
      buyTrades: 0,
      sellTrades: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      totalCommission: 0,
      finalReturn: 0,
      maxDrawdown: 0,
      sharpeRatio: 0
    };
  }

  // 전략 정보 반환
  public getStrategyInfo() {
    const descriptions = {
      safe: {
        name: "안전모드",
        description: "보수적인 매매로 안정적인 수익 추구",
        buyCondition: `${this.modeConfig.buyTarget * 100}% 이상 하락 시 매수`,
        sellCondition: `${this.modeConfig.sellTarget * 100}% 수익 시 매도`,
        riskLevel: "중간",
        expectedReturn: "연 15-25%",
        maxDrawdown: "20-30%"
      },
      aggressive: {
        name: "공세모드",
        description: "적극적인 매매로 높은 수익 추구",
        buyCondition: `${this.modeConfig.buyTarget * 100}% 이상 하락 시 매수`,
        sellCondition: `${this.modeConfig.sellTarget * 100}% 수익 시 매도`,
        riskLevel: "높음",
        expectedReturn: "연 30-50%",
        maxDrawdown: "40-60%"
      }
    };
    
    return descriptions[this.config.mode];
  }
}