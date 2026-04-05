'use client'

import { DongpaConfig, MarketData, DongpaTrade, TodaySignal } from '@/types';
import { getWeeklyRSIModeInfo, enrichDataWithWeeklyRSIMode, WeeklyModeInfo } from '@/utils/rsiCalculator';
import { getModeConfig, getTotalFeeRate, calculateTradingDays } from '@/utils/tradingConfig';

export class DongpaEngine {
  private config: DongpaConfig;
  private autoMode: boolean;  // RSI 기반 자동 모드 전환

  constructor(config: DongpaConfig, autoMode: boolean = true) {
    this.config = config;
    this.autoMode = autoMode;  // 기본값: RSI 자동 모드 활성화
  }

  /**
   * 자동 모드 설정 변경
   */
  public setAutoMode(enabled: boolean): void {
    this.autoMode = enabled;
  }

  /**
   * 현재 RSI 기반 모드 정보 반환
   */
  public getRSIModeInfo(priceData: MarketData[]): WeeklyModeInfo {
    return getWeeklyRSIModeInfo(priceData);
  }

  /**
   * 매수 조건 확인
   * - 전일 종가 대비 오늘 종가의 변동률이 목표 상승률 미만인지 체크
   * - 체결가는 오늘 종가
   */
  public getTodayBuySignal(config: {
    초기자금: number;
    분할횟수: number;
    매매모드: 'safe' | 'aggressive';
    오늘종가: number;
    전일종가: number;
    예수금: number;
  }): {
    신호: 'BUY' | 'HOLD';
    매수량: number;
    매수가: number;  // LOC 체결가 (오늘 종가)
    매수금액: number;
    수수료: number;
    상승률: number;
    목표상승률: number;
    메시지: string;
  } {
    const { 초기자금, 분할횟수, 매매모드, 오늘종가, 전일종가, 예수금 } = config;
    const modeConfig = getModeConfig(매매모드);

    // 전일 종가 대비 오늘 종가 변동률 계산
    const 변동률 = ((오늘종가 - 전일종가) / 전일종가);
    const 매수임계값 = modeConfig.buyTarget;  // 음수 (예: -0.03)

    // 분할금액 계산
    const 분할금액 = 초기자금 / 분할횟수;

    // 매수 조건: 전일 대비 하락률 ≥ |buyTarget| (buyTarget 이하로 하락 시 매수)
    if (변동률 <= 매수임계값 && 예수금 >= 분할금액) {
      // LOC: 오늘 종가에 매수
      const 매수량 = Math.floor(분할금액 / 오늘종가);
      const 매수금액 = 매수량 * 오늘종가;
      const 수수료 = 매수금액 * getTotalFeeRate();

      if (예수금 >= 매수금액 + 수수료) {
        return {
          신호: 'BUY',
          매수량,
          매수가: 오늘종가,
          매수금액,
          수수료,
          상승률: 변동률 * 100,
          목표상승률: 매수임계값 * 100,
          메시지: `🔻 매수: ${매수량}주 @$${오늘종가.toFixed(2)} (변동률 ${(변동률 * 100).toFixed(2)}% ≤ 목표 ${(매수임계값 * 100).toFixed(2)}%)`
        };
      }
    }

    return {
      신호: 'HOLD',
      매수량: 0,
      매수가: 0,
      매수금액: 0,
      수수료: 0,
      상승률: 변동률 * 100,
      목표상승률: 매수임계값 * 100,
      메시지: 변동률 > 매수임계값
        ? `대기: 변동률 ${(변동률 * 100).toFixed(2)}% > 목표 ${(매수임계값 * 100).toFixed(2)}%`
        : `현금 부족 (필요: $${분할금액.toFixed(2)}, 보유: $${예수금.toFixed(2)})`
    };
  }

  /**
   * 매도 조건 확인 (종가매매 LOC 방식)
   * - 평단가 대비 오늘 종가가 목표 수익률 이상인지 체크
   * - 체결가는 오늘 종가(LOC)
   * - 손절: 최대 보유기간 도달 시
   */
  public getTodaySellSignal(config: {
    매매모드: 'safe' | 'aggressive';
    오늘종가: number;
    평단가: number;
    보유량: number;
    매수일자: string;
    오늘날짜: string;
  }): {
    신호: 'SELL' | 'STOP_LOSS' | 'HOLD' | 'NO_POSITION';
    매도량: number;
    매도가: number;  // LOC 체결가 (오늘 종가)
    매도금액: number;
    수수료: number;
    실현수익: number;
    수익률: number;
    목표수익률: number;
    거래일보유기간: number;
    메시지: string;
    손절여부: boolean;
  } {
    const { 매매모드, 오늘종가, 평단가, 보유량, 매수일자, 오늘날짜 } = config;
    const modeConfig = getModeConfig(매매모드);

    if (보유량 === 0 || 평단가 === 0) {
      return {
        신호: 'NO_POSITION',
        매도량: 0,
        매도가: 0,
        매도금액: 0,
        수수료: 0,
        실현수익: 0,
        수익률: 0,
        목표수익률: modeConfig.sellTarget * 100,
        거래일보유기간: 0,
        메시지: '보유 종목 없음',
        손절여부: false
      };
    }

    // 거래일 기준 보유기간 계산 (주말 제외)
    const 거래일보유기간 = calculateTradingDays(매수일자, 오늘날짜);

    // 평단가 대비 오늘 종가 수익률 계산
    const 수익률 = (오늘종가 - 평단가) / 평단가;
    const 목표수익률 = modeConfig.sellTarget;

    // LOC: 오늘 종가에 매도
    const 매도금액 = 보유량 * 오늘종가;
    const 수수료 = 매도금액 * getTotalFeeRate();
    const 매수원가 = 보유량 * 평단가;
    const 실현수익 = 매도금액 - 매수원가 - 수수료;

    // 조건 1: 수익 목표 달성 → LOC 매도
    if (수익률 >= 목표수익률) {
      return {
        신호: 'SELL',
        매도량: 보유량,
        매도가: 오늘종가,  // LOC 체결가
        매도금액,
        수수료,
        실현수익,
        수익률: 수익률 * 100,
        목표수익률: 목표수익률 * 100,
        거래일보유기간,
        메시지: `🔺 LOC 매도: ${보유량}주 @$${오늘종가.toFixed(2)} (수익률 ${(수익률 * 100).toFixed(2)}% ≥ 목표 ${(목표수익률 * 100).toFixed(2)}%)`,
        손절여부: false
      };
    }

    // 조건 2: 최대 보유기간 도달 → LOC 손절
    if (거래일보유기간 >= modeConfig.holdingDays) {
      return {
        신호: 'STOP_LOSS',
        매도량: 보유량,
        매도가: 오늘종가,  // LOC 체결가
        매도금액,
        수수료,
        실현수익,
        수익률: 수익률 * 100,
        목표수익률: 목표수익률 * 100,
        거래일보유기간,
        메시지: `⚠️ LOC 손절: ${보유량}주 @$${오늘종가.toFixed(2)} (보유 ${거래일보유기간}일 ≥ ${modeConfig.holdingDays}일)`,
        손절여부: true
      };
    }

    // 조건 미충족 → 대기
    return {
      신호: 'HOLD',
      매도량: 0,
      매도가: 0,
      매도금액: 0,
      수수료: 0,
      실현수익: 0,
      수익률: 수익률 * 100,
      목표수익률: 목표수익률 * 100,
      거래일보유기간,
      메시지: `대기: 수익률 ${(수익률 * 100).toFixed(2)}% < 목표 ${(목표수익률 * 100).toFixed(2)}% (보유 ${거래일보유기간}/${modeConfig.holdingDays}일)`,
      손절여부: false
    };
  }

  /**
   * 일별 매매 기록 생성 (종가매매 LOC 방식)
   * - 매수/매도 체결가는 항상 오늘 종가
   */
  public generateDailyTradeRecord(config: {
    거래일자: string;
    종가: number;
    전일종가: number;
    매매모드: 'safe' | 'aggressive' | 'auto';
    이전기록?: DongpaTrade | null;
    초기자금: number;
    분할횟수: number;
    갱신주기: number; // 기본 10일
  }): DongpaTrade {
    const {
      거래일자, 종가, 전일종가, 매매모드: 원본모드, 이전기록,
      초기자금, 분할횟수, 갱신주기 = 10
    } = config;

    // auto 모드는 safe로 처리
    const 매매모드: 'safe' | 'aggressive' = 원본모드 === 'auto' ? 'safe' : 원본모드;

    const modeConfig = getModeConfig(매매모드);

    // 전일 대비 변동률 계산
    const 변동률 = ((종가 - 전일종가) / 전일종가) * 100;

    // 자금 갱신 체크 (갱신주기일마다)
    const 거래일수 = 이전기록 ? calculateTradingDays(이전기록.거래일자, 거래일자) : 0;
    const 자금갱신 = 거래일수 > 0 && 거래일수 % 갱신주기 === 0;

    // 현재 시드 계산
    let 현재시드 = 초기자금;
    if (이전기록) {
      현재시드 = 자금갱신 ? 초기자금 + 이전기록.누적손익 : 이전기록.시드;
    }

    const 매수예정 = 현재시드 / 분할횟수;

    // 현재 포트폴리오 상태
    const 현재예수금 = 이전기록?.예수금 || 초기자금;
    const 현재보유량 = 이전기록?.보유량 || 0;
    const 현재평단가 = 이전기록?.평단가 || 0;
    const 매수일자 = 이전기록?.매수일자 || '';

    // 매수 기준가 = 전일 종가 × (1 + 매수임계값) - 표시용 (전일 종가의 buyTarget% 하락 지점)
    const 매수지정가 = 전일종가 * (1 + modeConfig.buyTarget);
    const 목표량 = Math.floor(매수예정 / 매수지정가);

    // 매수 신호 체크 (종가매매 LOC)
    const 매수신호 = this.getTodayBuySignal({
      초기자금: 현재시드,
      분할횟수,
      매매모드,
      오늘종가: 종가,
      전일종가,
      예수금: 현재예수금
    });

    // 매도 신호 체크 (종가매매 LOC + 손절)
    const 매도신호 = this.getTodaySellSignal({
      매매모드,
      오늘종가: 종가,
      평단가: 현재평단가,
      보유량: 현재보유량,
      매수일자: 매수일자,
      오늘날짜: 거래일자
    });

    // 거래 실행
    let 매수가 = 0, 매수량 = 0, 매수금액 = 0, 매수수수료 = 0;
    let 새매수일자 = 매수일자;
    let 매도일 = '', 매도가 = 0, 매도량 = 0, 매도금액 = 0, 매도수수료 = 0;
    let 당일실현손익금액 = 0, 손익률 = 0, 손절여부 = false;

    // 매수 실행 (LOC: 오늘 종가에 체결)
    if (매수신호.신호 === 'BUY' && 현재보유량 === 0) {
      매수가 = 매수신호.매수가;  // LOC 체결가 (오늘 종가)
      매수량 = 매수신호.매수량;
      매수금액 = 매수신호.매수금액;
      매수수수료 = 매수신호.수수료;
      새매수일자 = 거래일자; // 매수일 기록
    }

    // 매도 실행 (LOC: 오늘 종가에 체결)
    if (매도신호.신호 === 'SELL' || 매도신호.신호 === 'STOP_LOSS') {
      매도일 = 거래일자;
      매도가 = 매도신호.매도가;  // LOC 체결가 (오늘 종가)
      매도량 = 매도신호.매도량;
      매도금액 = 매도신호.매도금액;
      매도수수료 = 매도신호.수수료;
      당일실현손익금액 = 매도신호.실현수익;
      손익률 = 매도신호.수익률;
      손절여부 = 매도신호.손절여부;
      새매수일자 = ''; // 매도 후 매수일 초기화
    }

    // 복리 계산
    let 갱신복리금액 = 0;
    if (당일실현손익금액 !== 0) {
      갱신복리금액 = 당일실현손익금액 > 0 ?
        당일실현손익금액 * modeConfig.profitReinvest :  // 이익복리
        당일실현손익금액 * modeConfig.lossReinvest;     // 손실복리
    }

    const 누적손익 = (이전기록?.누적손익 || 0) + 갱신복리금액;

    // 포트폴리오 업데이트
    const 새예수금 = 현재예수금 - 매수금액 - 매수수수료 + 매도금액 - 매도수수료;
    const 새보유량 = 현재보유량 + 매수량 - 매도량;

    // 평단가 재계산
    let 새평단가 = 0;
    if (매수량 > 0 && 새보유량 > 0) {
      const 기존보유가치 = 현재보유량 * 현재평단가;
      const 신규매수가치 = 매수량 * 매수가;
      새평단가 = (기존보유가치 + 신규매수가치) / 새보유량;
    } else if (새보유량 > 0) {
      새평단가 = 현재평단가;
    }

    // 목표가 = 평단가 × (1 + 목표수익률)
    const 목표가 = 새평단가 > 0 ? 새평단가 * (1 + modeConfig.sellTarget) : 0;

    // 거래일 보유기간 계산
    const 거래일보유기간 = 새매수일자 ? calculateTradingDays(새매수일자, 거래일자) : 0;

    const 평가금 = 새보유량 * 종가;
    const 총자산 = 새예수금 + 평가금;
    const 수익률 = ((총자산 - 초기자금) / 초기자금) * 100;

    // DD 계산
    const 최고자산 = Math.max(총자산, 이전기록?.최고자산 || 초기자금);
    const DD = 최고자산 > 총자산 ? ((최고자산 - 총자산) / 최고자산) * 100 : 0;

    const 거래기록: DongpaTrade = {
      거래일자,
      종가,
      매매모드,
      변동률,
      매수예정,
      매수지정가,  // 전일 종가 × (1 + 목표상승률)
      목표량,
      매수가,
      매수량,
      매수금액,
      매수수수료,
      매도지정가: 목표가,  // 목표 매도가
      목표가,
      매수일자: 새매수일자,
      거래일보유기간,
      MOC: 매도신호.신호 === 'STOP_LOSS' ? 'STOP_LOSS' :
           매도신호.신호 === 'SELL' ? 'SELL' : 'HOLD',
      매도일,
      매도가,
      매도량,
      매도금액,
      매도수수료,
      당일실현손익금액,
      손익률,
      손절여부,
      누적손익,
      갱신복리금액,
      자금갱신,
      시드: 현재시드,
      증액입출금: 0,
      예수금: 새예수금,
      보유량: 새보유량,
      평가금,
      총자산,
      수익률,
      DD,
      평단가: 새평단가,
      최고자산
    };

    return 거래기록;
  }

  /**
   * 여러 일자의 매매 기록 생성 (종가매매 LOC + RSI 자동 모드)
   */
  public generateTradeHistory(historicalData: MarketData[]): DongpaTrade[] {
    if (!historicalData.length) return [];

    // RSI 자동 모드일 경우, 주간 RSI 기반 모드 정보 추가
    const enrichedData = this.autoMode
      ? enrichDataWithWeeklyRSIMode(historicalData)
      : historicalData.map(d => ({ ...d, mode: this.config.mode, modeReason: '수동 설정' }));

    const trades: DongpaTrade[] = [];
    let 이전기록: DongpaTrade | null = null;

    enrichedData.forEach((dayData, index) => {
      // 전일 종가 가져오기
      const 전일종가 = index > 0 ? enrichedData[index - 1].price : dayData.price;

      // 자동 모드일 경우, 주간 RSI 기반 모드 적용
      const 매매모드 = this.autoMode
        ? (dayData as { mode: 'safe' | 'aggressive' }).mode
        : this.config.mode;

      const 거래기록 = this.generateDailyTradeRecord({
        거래일자: dayData.date,
        종가: dayData.price,
        전일종가,
        매매모드,
        이전기록,
        초기자금: this.config.initialCapital,
        분할횟수: this.config.divisions,
        갱신주기: 10
      });

      trades.push(거래기록);
      이전기록 = 거래기록;
    });

    return trades;
  }

  // 오늘 매매 신호 (실시간)
  public getTodayTradingSignals(
    오늘종가: number,
    전일종가: number,
    오늘날짜: string,
    최근거래기록?: DongpaTrade
  ): TodaySignal {
    const 현재예수금 = 최근거래기록?.예수금 || this.config.initialCapital;
    const 현재보유량 = 최근거래기록?.보유량 || 0;
    const 현재평단가 = 최근거래기록?.평단가 || 0;
    const 현재시드 = 최근거래기록?.시드 || this.config.initialCapital;
    const 매수일자 = 최근거래기록?.매수일자 || '';

    // auto 모드는 safe로 처리 (실제로는 RSI 기반으로 동적 결정되어야 하나 여기서는 기본값 사용)
    const 실행모드: 'safe' | 'aggressive' = this.config.mode === 'auto' ? 'safe' : this.config.mode;

    const 매수신호 = this.getTodayBuySignal({
      초기자금: 현재시드,
      분할횟수: this.config.divisions,
      매매모드: 실행모드,
      오늘종가,
      전일종가,
      예수금: 현재예수금
    });

    const 매도신호 = this.getTodaySellSignal({
      매매모드: 실행모드,
      오늘종가,
      평단가: 현재평단가,
      보유량: 현재보유량,
      매수일자,
      오늘날짜
    });

    return { 매수신호, 매도신호 };
  }

  // 전략 정보 반환
  public getStrategyInfo() {
    const 실행모드: 'safe' | 'aggressive' = this.config.mode === 'auto' ? 'safe' : this.config.mode;
    const modeConfig = getModeConfig(실행모드);

    const descriptions = {
      safe: {
        name: "안전모드",
        description: "보수적인 매매로 안정적인 수익 추구",
        buyCondition: `매수 조건: 전일 대비 하락률 ≥ ${Math.abs(modeConfig.buyTarget * 100)}% (${modeConfig.buyTarget * 100}% 이하 하락 시 매수)`,
        sellCondition: `매도 조건: 평단가 대비 ${modeConfig.sellTarget * 100}% 수익 또는 ${modeConfig.holdingDays}거래일 도달 시 손절`,
        riskLevel: "중간",
        expectedReturn: "연 15-25%",
        maxDrawdown: "20-30%",
        maxHoldingDays: modeConfig.holdingDays
      },
      aggressive: {
        name: "공세모드",
        description: "적극적인 매매로 높은 수익 추구",
        buyCondition: `매수 조건: 전일 대비 하락률 ≥ ${Math.abs(modeConfig.buyTarget * 100)}% (${modeConfig.buyTarget * 100}% 이하 하락 시 매수)`,
        sellCondition: `매도 조건: 평단가 대비 ${modeConfig.sellTarget * 100}% 수익 또는 ${modeConfig.holdingDays}거래일 도달 시 손절`,
        riskLevel: "높음",
        expectedReturn: "연 30-50%",
        maxDrawdown: "40-60%",
        maxHoldingDays: modeConfig.holdingDays
      },
      auto: {
        name: "자동모드",
        description: "RSI 기반 시장 상황 대응",
        buyCondition: `RSI 지표에 따라 안전/공세 자동 전환`,
        sellCondition: `모드별 조건 자동 적용`,
        riskLevel: "변동",
        expectedReturn: "시장 대응형",
        maxDrawdown: "20-60%",
        maxHoldingDays: 30
      }
    };

    return descriptions[this.config.mode];
  }
}