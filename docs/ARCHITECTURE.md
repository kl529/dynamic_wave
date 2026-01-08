# 프로젝트 아키텍처

> 동파법 SOXL 매매 시스템의 전체 구조를 설명합니다.

## 디렉토리 구조

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx           # 메인 페이지 (오늘 매매)
│   ├── backtest/          # 백테스팅 페이지
│   │   └── page.tsx
│   ├── layout.tsx         # 레이아웃
│   └── api/
│       └── yahoo-finance/ # Yahoo Finance API 프록시
│           └── route.ts
│
├── components/            # React 컴포넌트
│   ├── TodayOverview.tsx        # 오늘 개요
│   ├── TodaySignalPanel.tsx     # 매매 신호 패널
│   ├── DivisionStatusPanel.tsx  # 분할 상태
│   ├── ConfigPanel.tsx          # 설정 패널
│   ├── TradeRecordForm.tsx      # 거래 기록 입력
│   ├── TradeRecordList.tsx      # 거래 기록 목록
│   ├── CurrentInvestmentStatus.tsx  # 현재 투자 상태
│   ├── BacktestPanel.tsx        # 백테스트 패널
│   ├── BacktestConfigPanel.tsx  # 백테스트 설정
│   ├── BacktestDebugTable.tsx   # 백테스트 상세 테이블
│   ├── BacktestStatsDashboard.tsx # 백테스트 통계
│   ├── BacktestResultsChart.tsx # 백테스트 차트
│   ├── DongpaTradeTable.tsx     # 거래 테이블
│   ├── RealtimePanel.tsx        # 실시간 패널
│   ├── RSIModeIndicator.tsx     # RSI 모드 표시
│   └── PWAInstallPrompt.tsx     # PWA 설치 안내
│
├── services/              # 비즈니스 로직
│   ├── dongpaEngine.ts         # 동파법 메인 엔진
│   ├── divisionEngine.ts       # 분할 매매 엔진
│   ├── marketDataService.ts    # 시장 데이터 서비스
│   ├── supabaseService.ts      # Supabase 연동
│   └── notifications.ts        # 알림 서비스
│
├── hooks/                 # Custom Hooks
│   ├── useDongpaEngine.ts      # 동파법 엔진 훅
│   └── useRSIMode.ts           # RSI 모드 훅
│
├── utils/                 # 유틸리티
│   ├── tradingConfig.ts        # 매매 설정
│   ├── rsiCalculator.ts        # RSI 계산
│   └── divisionStateCalculator.ts # 분할 상태 계산
│
├── types/                 # TypeScript 타입
│   └── index.ts
│
└── lib/                   # 라이브러리 설정
    └── supabase.ts
```

---

## 핵심 모듈

### 1. 매매 엔진

#### DongpaEngine (`services/dongpaEngine.ts`)
단일 포트폴리오 방식의 동파법 엔진

```typescript
class DongpaEngine {
  // 거래 히스토리 생성
  generateTradeHistory(data: MarketData[]): DongpaTrade[]
  
  // 오늘 매매 신호
  getTodayTradingSignals(...): TodaySignal
  
  // 전략 정보
  getStrategyInfo(): {...}
}
```

#### DivisionEngine (`services/divisionEngine.ts`)
5분할 독립 운영 방식의 매매 엔진

```typescript
class DivisionEngine {
  // 분할 초기화
  initializeDivisions(): DivisionPortfolio[]
  
  // 재분할
  rebalanceDivisions(...): DivisionPortfolio[]
  
  // 일별 매매 처리
  processDailyTrade(...): DailyTradeRecord
  
  // 백테스팅
  backtest(data: MarketData[]): DailyTradeRecord[]
  
  // 오늘 신호
  getTodaySignals(...): {...}
}
```

### 2. 데이터 흐름

```
Yahoo Finance API
       ↓
marketDataService.ts (데이터 파싱)
       ↓
useDongpaEngine.ts (훅)
       ↓
   ┌───┴───┐
   ↓       ↓
page.tsx  divisionEngine.ts
(UI)      (백테스팅)
```

### 3. 상태 관리

```
localStorage
├── dongpaConfig       # 사용자 설정
└── tradeRecords       # 거래 기록

Supabase (Optional)
├── trade_records      # 거래 기록
├── user_settings      # 사용자 설정
└── backtest_results   # 백테스트 결과
```

---

## 매매 로직

### 매수 조건

```
안전모드: 전일 대비 -3.0% 이하
공세모드: 전일 대비 -5.0% 이하
```

### 매도 조건

```
안전모드: 평단가 대비 +0.2% 이상 또는 30거래일 경과
공세모드: 평단가 대비 +2.5% 이상 또는 7거래일 경과
```

### LOC (Limit-On-Close) 주문

```
1. 장 마감 전 전일 종가 기준으로 매매 신호 계산
2. 지정가 주문 제출 (종가에 체결)
3. 당일 종가에서 조건 충족 시 체결
```

---

## 모드 시스템

### 수동 모드
- `safe`: 안전모드 고정
- `aggressive`: 공세모드 고정

### 자동 모드 (`auto`)
RSI 기반 자동 모드 전환:
- RSI < 30: `aggressive` (과매도)
- RSI > 70: `safe` (과매수)
- 30 ≤ RSI ≤ 70: `safe` (기본값)

---

## 수수료 구조

```typescript
// src/utils/tradingConfig.ts
export const FEES = {
  commission: 0.00044,  // 0.044% 거래 수수료
  secFee: 0.0000278     // 0.00278% SEC 수수료
};

// 총 수수료율 (편도): 0.047%
```

---

## 주요 타입

```typescript
// 설정
interface DongpaConfig {
  initialCapital: number;  // 초기 자본
  divisions: number;       // 분할 수 (기본 5)
  mode: 'safe' | 'aggressive' | 'auto';
  rebalancePeriod: number; // 재분할 주기 (거래일)
}

// 분할 포트폴리오
interface DivisionPortfolio {
  divisionNumber: number;
  status: 'EMPTY' | 'HOLDING';
  cash: number;
  holdings: number;
  avgPrice: number;
  buyDate: string;
  // ...
}

// 일별 거래 기록
interface DailyTradeRecord {
  date: string;
  closePrice: number;
  changeRate: number;
  mode: 'safe' | 'aggressive';
  divisionActions: DivisionAction[];
  // ...
}
```

---

## API 엔드포인트

### `/api/yahoo-finance`

Yahoo Finance 데이터 프록시

```
GET /api/yahoo-finance?symbol=SOXL
→ 실시간 시세

GET /api/yahoo-finance?symbol=SOXL&period=90d
→ 90일 과거 데이터
```
