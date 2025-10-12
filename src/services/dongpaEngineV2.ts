'use client'

import { DongpaConfig, MarketData } from '@/types';

// 분할별 포트폴리오 타입
interface DivisionPortfolio {
  cash: number;
  holdings: number;
  avgPrice: number;
  buyDate: string | null;
  status: 'EMPTY' | 'HOLDING';
  mode: 'safe' | 'aggressive';
}

// 일별 거래 기록 타입
interface DailyTrade {
  key: number;
  date: string;
  price: number;
  change: number;
  action: 'NET_BUY' | 'NET_SELL' | 'HOLD';
  dailyActions: DivisionAction[];
  totalBuyQty: number;
  totalSellQty: number;
  netQuantity: number;
  totalCash: number;
  totalHoldings: number;
  currentValue: number;
  totalAssets: number;
  returnRate: number;
  dailyProfit: number;
  drawdown: number;
  divisionStatus: DivisionStatus[];
}

// 분할별 액션 타입
interface DivisionAction {
  division: number;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  amount: number;
  commission: number;
  profit?: number;
  profitRate?: number;
  holdingDays?: number;
  reason?: '수익' | '손절';
}

// 분할 상태 타입
interface DivisionStatus {
  division: number;
  status: 'EMPTY' | 'HOLDING';
  holdings: number;
  avgPrice: number;
  cash: number;
  holdingDays: number;
  profitRate: number;
}

export class DongpaEngineV2 {
  private config: DongpaConfig;
  private fees = {
    commission: 0.00044,  // 0.044%
    secFee: 0.0000278     // 0.00278%
  };
  private modes = {
    safe: {
      sellTarget: 0.002,   // 0.2% 수익
      buyTarget: 0.03,     // 3.0% 하락
      holdingDays: 30      // 최대 30일 보유
    },
    aggressive: {
      sellTarget: 0.025,   // 2.5% 수익
      buyTarget: 0.05,     // 5.0% 하락
      holdingDays: 7       // 최대 7일 보유
    }
  };

  constructor(config: DongpaConfig) {
    this.config = {
      ...config,
      divisions: 5  // 5분할 고정
    };
  }

  // 메인 계산 함수 - 5분할 독립 운영
  public calculateSignals(priceData: MarketData[]) {
    const { initialCapital, divisions, mode } = this.config;
    const modeConfig = this.modes[mode];
    const baseAmount = initialCapital / divisions;

    // 분할별 독립 포트폴리오 초기화
    const divisionPortfolios: DivisionPortfolio[] = Array.from({ length: divisions }, () => ({
      cash: baseAmount,
      holdings: 0,
      avgPrice: 0,
      buyDate: null,
      status: 'EMPTY' as const,
      mode
    }));

    const trades: DailyTrade[] = [];
    let peakValue = initialCapital;
    let maxDrawdown = 0;

    priceData.forEach((day, index) => {
      // 전일 종가 대비 변동률 계산
      let changeRate = 0;
      if (index > 0) {
        const prevClose = priceData[index - 1].price;
        changeRate = (day.price - prevClose) / prevClose;
      }

      const dailyActions: DivisionAction[] = [];
      let totalBuyQty = 0;
      let totalSellQty = 0;
      let totalBuyAmount = 0;
      let totalSellAmount = 0;
      let dailyProfit = 0;

      // 각 분할별로 매수/매도 조건 체크
      divisionPortfolios.forEach((division, divIndex) => {
        // 매수 조건 체크 (비어있는 분할만)
        if (
          division.status === 'EMPTY' &&
          changeRate <= -modeConfig.buyTarget &&
          division.cash >= baseAmount * 0.9
        ) {
          const quantity = Math.floor(division.cash / day.price);
          const amount = quantity * day.price;
          const commission = amount * (this.fees.commission + this.fees.secFee);

          if (division.cash >= amount + commission) {
            // 매수 실행
            division.holdings = quantity;
            division.avgPrice = day.price;
            division.buyDate = day.date;
            division.cash = 0;
            division.status = 'HOLDING';

            totalBuyQty += quantity;
            totalBuyAmount += amount + commission;

            dailyActions.push({
              division: divIndex + 1,
              action: 'BUY',
              quantity,
              price: day.price,
              amount,
              commission
            });
          }
        }

        // 매도 조건 체크 (보유 중인 분할만)
        if (division.status === 'HOLDING') {
          const profitRate = (day.price - division.avgPrice) / division.avgPrice;
          const holdingDays = division.buyDate
            ? Math.floor((new Date(day.date).getTime() - new Date(division.buyDate).getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          const shouldSell =
            profitRate >= modeConfig.sellTarget ||
            holdingDays >= modeConfig.holdingDays;

          if (shouldSell) {
            // 매도 실행
            const quantity = division.holdings;
            const amount = quantity * day.price;
            const commission = amount * (this.fees.commission + this.fees.secFee);
            const profit = amount - (quantity * division.avgPrice) - commission;
            const sellReason = profitRate >= modeConfig.sellTarget ? '수익' : '손절';

            division.cash = amount - commission;
            division.holdings = 0;
            division.avgPrice = 0;
            division.buyDate = null;
            division.status = 'EMPTY';

            totalSellQty += quantity;
            totalSellAmount += amount;
            dailyProfit += profit;

            dailyActions.push({
              division: divIndex + 1,
              action: 'SELL',
              quantity,
              price: day.price,
              amount,
              commission,
              profit,
              profitRate: profitRate * 100,
              holdingDays,
              reason: sellReason
            });
          }
        }
      });

      // 전체 포트폴리오 가치 계산
      const totalCash = divisionPortfolios.reduce((sum, div) => sum + div.cash, 0);
      const totalHoldings = divisionPortfolios.reduce((sum, div) => sum + div.holdings, 0);
      const currentValue = divisionPortfolios.reduce(
        (sum, div) => sum + (div.holdings * day.price),
        0
      );
      const totalAssets = totalCash + currentValue;

      // MDD 계산
      if (totalAssets > peakValue) {
        peakValue = totalAssets;
      }
      const drawdown = (peakValue - totalAssets) / peakValue;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      const returnRate = ((totalAssets - initialCapital) / initialCapital) * 100;

      // 순매매량 계산
      const netQuantity = totalBuyQty - totalSellQty;
      const netAction = netQuantity > 0 ? 'NET_BUY' : netQuantity < 0 ? 'NET_SELL' : 'HOLD';

      trades.push({
        key: index,
        date: day.date,
        price: day.price,
        change: changeRate * 100,
        action: dailyActions.length > 0 ? netAction : 'HOLD',
        dailyActions,
        totalBuyQty,
        totalSellQty,
        netQuantity: Math.abs(netQuantity),
        totalCash,
        totalHoldings,
        currentValue,
        totalAssets,
        returnRate,
        dailyProfit,
        drawdown: -drawdown * 100,
        divisionStatus: divisionPortfolios.map((div, idx) => ({
          division: idx + 1,
          status: div.status,
          holdings: div.holdings,
          avgPrice: div.avgPrice,
          cash: div.cash,
          holdingDays: div.buyDate
            ? Math.floor((new Date(day.date).getTime() - new Date(div.buyDate).getTime()) / (1000 * 60 * 60 * 24))
            : 0,
          profitRate: div.holdings > 0
            ? ((day.price - div.avgPrice) / div.avgPrice) * 100
            : 0
        }))
      });
    });

    return {
      trades,
      divisionPortfolios,
      finalValue: divisionPortfolios.reduce(
        (sum, div) => sum + div.cash + (div.holdings * priceData[priceData.length - 1].price),
        0
      ),
      maxDrawdown
    };
  }

  // 요약 통계 생성
  public generateSummary(trades: DailyTrade[]) {
    const allActions = trades.flatMap(t => t.dailyActions || []);
    const buyActions = allActions.filter(a => a.action === 'BUY');
    const sellActions = allActions.filter(a => a.action === 'SELL');
    const profitableSells = sellActions.filter(a => a.profit && a.profit > 0);

    return {
      totalTrades: allActions.length,
      buyTrades: buyActions.length,
      sellTrades: sellActions.length,
      winRate: sellActions.length > 0
        ? (profitableSells.length / sellActions.length * 100)
        : 0,
      avgWin: profitableSells.length > 0
        ? profitableSells.reduce((sum, a) => sum + (a.profit || 0), 0) / profitableSells.length
        : 0,
      avgLoss: (sellActions.length - profitableSells.length) > 0
        ? sellActions.filter(a => a.profit && a.profit < 0).reduce((sum, a) => sum + (a.profit || 0), 0) /
          (sellActions.length - profitableSells.length)
        : 0,
      totalCommission: allActions.reduce((sum, a) => sum + (a.commission || 0), 0),
      totalProfit: sellActions.reduce((sum, a) => sum + (a.profit || 0), 0),
      finalReturn: trades.length > 0 ? trades[trades.length - 1].returnRate : 0,
      divisionStats: this.calculateDivisionStats(trades)
    };
  }

  // 분할별 통계 계산
  private calculateDivisionStats(trades: DailyTrade[]) {
    const divisionData: Record<string, any> = {};

    trades.forEach(trade => {
      if (trade.dailyActions) {
        trade.dailyActions.forEach(action => {
          const divKey = `division${action.division}`;
          if (!divisionData[divKey]) {
            divisionData[divKey] = {
              division: action.division,
              trades: 0,
              wins: 0,
              losses: 0,
              totalProfit: 0
            };
          }

          if (action.action === 'SELL') {
            divisionData[divKey].trades++;
            if (action.profit && action.profit > 0) {
              divisionData[divKey].wins++;
              divisionData[divKey].totalProfit += action.profit;
            } else {
              divisionData[divKey].losses++;
              divisionData[divKey].totalProfit += action.profit || 0;
            }
          }
        });
      }
    });

    return Object.values(divisionData).map((div: any) => ({
      ...div,
      winRate: div.trades > 0 ? (div.wins / div.trades * 100) : 0
    }));
  }

  // 전략 정보
  public getStrategyInfo() {
    const modeConfig = this.modes[this.config.mode];

    return {
      safe: {
        name: "안전모드",
        buyTarget: `${modeConfig.buyTarget * 100}% 하락`,
        sellTarget: `${modeConfig.sellTarget * 100}% 수익`,
        maxHolding: `${modeConfig.holdingDays}일`,
        description: "보수적 매매, 빠른 익절"
      },
      aggressive: {
        name: "공세모드",
        buyTarget: `${modeConfig.buyTarget * 100}% 하락`,
        sellTarget: `${modeConfig.sellTarget * 100}% 수익`,
        maxHolding: `${modeConfig.holdingDays}일`,
        description: "공격적 매매, 큰 수익 추구"
      }
    }[this.config.mode];
  }
}
