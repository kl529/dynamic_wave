# 📖 동파법 SOXL 자동매매 시스템 가이드

> **완전한 가이드**: 전략, 시스템 구조, 사용법, 개발 가이드

## 목차
- [📊 동파법 전략 상세](#-동파법-전략-상세)
- [🏗️ 시스템 아키텍처](#️-시스템-아키텍처)
- [💻 사용 가이드](#-사용-가이드)
- [🛠️ 개발 가이드](#️-개발-가이드)

---

## 📊 동파법 전략 상세

### 핵심 원리

**동파법(Dongpa Method)**은 레버리지 ETF의 높은 변동성을 활용한 **5분할 독립 매매** 전략입니다.

- **대상 종목**: SOXL (반도체 3배 레버리지 ETF)
- **매매 방식**: **LOC (Limit-on-Close)** 종가 지정가 매매
- **분할 횟수**: 5분할 고정
- **핵심 특징**: 각 분할이 독립적으로 운영 (개별 매수일, 개별 평단가, 개별 매도)
- **전략**: 하락 시 분할 매수 → 개별 분할 조건 충족 시 해당 분할만 매도

### 종가 매수 방식

**장 마감 시점의 종가로 매수/매도하는 방식**

#### 📉 매수 조건
```typescript
// 1. 전일 종가 대비 변동률 계산
변동률 = (오늘_종가 - 전일_종가) / 전일_종가

// 2. 변동률이 목표 상승률 미만이면 매수
if (변동률 < 매수목표상승률) {
  체결가 = 오늘_종가  // 종가에 매수
}

실제 예 (안전모드 3%):
- 전일 종가: $100
- 오늘 종가: $102 → 변동률 +2% < 3% → ✅ 매수! ($102에 매수)
- 오늘 종가: $97 → 변동률 -3% < 3% → ✅ 매수! ($97에 매수)
- 오늘 종가: $105 → 변동률 +5% ≥ 3% → ❌ 매수 안함

의미: 전날보다 3% 미만 상승하거나 하락하면 매수
```

#### 📈 매도 조건
```typescript
// 1. 평단가 대비 수익률 계산
수익률 = (오늘_종가 - 평단가) / 평단가

// 2. 수익률이 목표 이상이거나 최대 보유기간 도달 시 매도
if (수익률 >= 목표수익률 || 보유일수 >= 최대보유일) {
  체결가 = 오늘_종가  // 종가에 매도
}

실제 예 (안전모드 0.2%):
- 평단가: $100
- 오늘 종가: $100.30 → 수익률 +0.3% ≥ 0.2% → ✅ 매도! ($100.30에 매도)
- 오늘 종가: $100.10 → 수익률 +0.1% < 0.2% → ❌ 대기
- 보유 30일 도달 → 수익률 관계없이 ✅ 손절 매도
```

#### 🎯 종가 매매의 장점
1. **슬리피지 최소화**: 종가에 체결되어 예측 가능
2. **백테스팅 정확성**: 과거 종가 데이터로 정확한 시뮬레이션
3. **수수료 절감**: 하루 1회 매매로 수수료 최소화
4. **단순한 로직**: 변동률만 계산하면 되므로 구현과 이해가 쉬움

### 💰 퉁치기 (Netting)

**같은 날 매수와 매도가 동시에 발생하면 순매매량만 거래하여 수수료 절감**

#### 퉁치기 예시
```typescript
// 분할1: 20주 매도 신호
// 분할2: 34주 매수 신호

// ❌ 퉁치기 전
- 매도: 20주 × $40 = $800 → 수수료 $0.38
- 매수: 34주 × $40 = $1,360 → 수수료 $0.64
- 총 수수료: $1.02

// ✅ 퉁치기 후
- 순매수: (34 - 20) = 14주만 매수
- 실제 거래: 14주 × $40 = $560 → 수수료 $0.26
- 절약 수수료: $1.02 - $0.26 = $0.76 (74% 절약!)
```

#### 퉁치기 로직
```typescript
const totalBuyQuantity = 34;  // 전체 매수량
const totalSellQuantity = 20;  // 전체 매도량
const netQuantity = totalBuyQuantity - totalSellQuantity;  // 순매매량

if (netQuantity > 0) {
  // 순매수: 14주만 매수
  실제거래 = { type: 'BUY', quantity: 14 };
} else if (netQuantity < 0) {
  // 순매도: 절대값만큼 매도
  실제거래 = { type: 'SELL', quantity: Math.abs(netQuantity) };
} else {
  // 정확히 상쇄: 거래 없음
  실제거래 = null;
}
```

#### 장점
- **수수료 절감**: 상쇄된 수량만큼 수수료 절약
- **거래 단순화**: 하루 1회 순매매만 실행
- **실전 반영**: 실제 증권계좌에서도 동일하게 처리

### 분할별 독립 운영

각 분할은 별도의 포트폴리오로 관리됩니다:

```javascript
// ❌ 잘못된 이해: 전체를 하나로 관리
전체_보유량 = 211주
전체_평단가 = $28.50
→ 한번에 전량 매도

// ✅ 올바른 이해: 각 분할을 독립 관리
분할1: { 매수일: 1/1, 보유: 68주, 평단가: $29.10, 보유일수: 5일 }
분할2: { 매수일: 1/3, 보유: 70주, 평단가: $28.20, 보유일수: 3일 }
분할3: { 매수일: 1/5, 보유: 73주, 평단가: $27.30, 보유일수: 1일 }
분할4: { 현금: $2,000, 비어있음 }
분할5: { 현금: $2,000, 비어있음 }
→ 조건 충족한 분할만 개별 매도
```

### 모드별 전략

#### 안전모드 (Safe Mode)
```javascript
{
  매수조건: '전일 종가 대비 +3.0% 이상 상승',
  매도조건: '+0.2% 수익 달성 또는 30거래일 경과 시',
  보유기간: '최대 30거래일',
  복리설정: {
    이익복리: 80,  // 수익의 80%를 재투자
    손실복리: 30   // 손실의 30%를 다음 회차에 반영
  }
}
```

**RSI 기반 안전모드 진입 조건** (3가지 중 하나라도 충족):
1. RSI > 65 영역에서 하락
2. 40 < RSI < 50 영역에서 하락
3. RSI가 50 밑으로 하락 (50선 하향 돌파)

#### 공세모드 (Aggressive Mode)
```javascript
{
  매수조건: '전일 종가 대비 +5.0% 이상 상승',
  매도조건: '+2.5% 수익 달성 또는 7거래일 경과 시',
  보유기간: '최대 7거래일',
  복리설정: {
    이익복리: 80,  // 수익의 80%를 재투자
    손실복리: 30   // 손실의 30%를 다음 회차에 반영
  }
}
```

**RSI 기반 공세모드 진입 조건** (3가지 중 하나라도 충족):
1. RSI가 50 위로 상승 (50선 상향 돌파)
2. RSI < 35 영역에서 상승
3. 30 < RSI < 60 영역에서 상승

### RSI 기반 자동 모드 전환

매일 장 마감 후 **14일 RSI**를 계산하여 다음날 모드를 자동으로 결정합니다.

```typescript
// RSI 계산 (14일 기준)
export function calculateRSI(priceData: MarketData[], period: number = 14)

// 모드 자동 결정
export function determineTradingMode(currentRSI: number, prevRSI: number): 'safe' | 'aggressive'

// 최신 모드 정보 조회
export function getLatestRSIMode(priceData: MarketData[])
```

### 매매 흐름 예시

```javascript
// Day 1 (월요일): 1분할 매수 신호
시스템: "1분할 매수: 68주 @$29.10 (전일 대비 -3.2% 하락)"

// Day 3 (화요일): 2분할 매수 신호
시스템: "2분할 매수: 70주 @$28.20 (전일 대비 -3.5% 하락)"

// Day 5 (수요일): 1분할 매도 + 3분할 매수
시스템: "1분할 매도: 68주 (+0.2% 수익)"
시스템: "3분할 매수: 73주 @$27.30"
→ 실제 실행: 68주 매도하고 73주 매수 = 순5주 매수

// Day 7 (목요일): 2분할 매도만
시스템: "2분할 매도: 70주 (+0.3% 수익)"
→ 실제 실행: 70주 매도만
```

### 수수료 및 슬리피지

```javascript
fees = {
  commission: 0.00044,  // 0.044% 거래 수수료
  secFee: 0.0000278     // 0.00278% SEC 수수료
}
// 총 수수료율: 0.047% (편도)
```

---

## 🏗️ 시스템 아키텍처

### 기술 스택

```
Frontend
├── Next.js 14 (App Router)
├── TypeScript
├── Ant Design (UI 컴포넌트)
├── Tailwind CSS (스타일링)
└── Recharts (차트)

Data
├── Yahoo Finance API (실시간 시세)
├── Alpha Vantage API (과거 데이터)
└── localStorage (사용자 설정/기록)
```

### 프로젝트 구조

```
dongpa/
├── src/
│   ├── app/
│   │   ├── page.tsx              # 메인 페이지 (오늘 매매 신호)
│   │   ├── backtest/page.tsx     # 백테스팅 페이지
│   │   ├── layout.tsx            # 레이아웃
│   │   └── globals.css           # 전역 스타일
│   │
│   ├── components/
│   │   ├── ConfigPanel.tsx       # 설정 패널
│   │   ├── TodaySignalPanel.tsx  # 오늘 매매 신호
│   │   ├── TodayOverview.tsx     # 오늘 개요
│   │   ├── DivisionStatusPanel.tsx  # 5분할 대시보드
│   │   ├── TradeRecordForm.tsx   # 거래 기록 폼
│   │   ├── TradeRecordList.tsx   # 거래 내역 목록
│   │   ├── BacktestConfigPanel.tsx  # 백테스팅 설정
│   │   ├── BacktestResultsChart.tsx # 결과 차트
│   │   ├── BacktestStatsDashboard.tsx # 통계
│   │   ├── BacktestDebugTable.tsx # 디버깅 테이블
│   │   └── RSIModeIndicator.tsx  # RSI 모드 표시
│   │
│   ├── services/
│   │   ├── divisionEngine.ts     # ⭐ 5분할 독립 운영 엔진
│   │   ├── dongpaEngine.ts       # ⭐ 동파법 계산 엔진
│   │   ├── marketDataService.ts  # 시장 데이터 조회
│   │   └── notifications.ts      # 알림 서비스
│   │
│   ├── hooks/
│   │   ├── useDongpaEngine.ts    # 동파법 계산 훅
│   │   └── useRSIMode.ts         # RSI 모드 훅
│   │
│   ├── utils/
│   │   ├── rsiCalculator.ts      # ⭐ RSI 계산 유틸리티
│   │   └── mockData.ts           # 개발용 Mock 데이터
│   │
│   └── types/
│       └── index.ts              # 타입 정의
│
├── public/
│   ├── manifest.json             # PWA 설정
│   └── sw.js                     # Service Worker
│
├── GUIDE.md                      # 📖 이 파일
├── README.md                     # 프로젝트 소개
└── package.json
```

### 핵심 서비스

#### 1. DivisionEngine (분할 운영 엔진)

5분할 독립 운영의 핵심 로직을 담당합니다.

```typescript
class DivisionEngine {
  // 분할 포트폴리오 초기화
  initializeDivisions(): DivisionPortfolio[]

  // 매수 시그널 처리 (빈 분할에 매수)
  processBuySignals(...)

  // 매도 시그널 처리 (보유 분할 매도)
  processSellSignals(...)

  // 백테스팅 실행
  backtest(marketData: MarketData[], rsiModes?: Map): DailyTradeRecord[]

  // 재분할 (N일마다 자산 재분배)
  rebalance(...)
}
```

**위치**: `src/services/divisionEngine.ts`

#### 2. RSI Calculator (RSI 계산기)

일간/주간 RSI 계산 및 모드 결정을 담당합니다.

```typescript
// 일간 RSI 계산 (14일 기준)
calculateRSI(priceData: MarketData[], period = 14)

// 주간 RSI 계산 (14주 기준)
calculateWeeklyRSI(priceData: MarketData[], period = 14)

// 모드 자동 결정
determineTradingMode(currentRSI: number, prevRSI: number): 'safe' | 'aggressive'

// 주간 RSI 기반 모드 정보
getWeeklyRSIModeInfo(priceData: MarketData[]): WeeklyModeInfo

// 일간 데이터에 모드 추가
enrichDataWithWeeklyRSIMode(priceData: MarketData[])
```

**위치**: `src/utils/rsiCalculator.ts`

#### 3. MarketDataService (시장 데이터)

Yahoo Finance / Alpha Vantage API를 통한 실시간/과거 데이터 조회를 담당합니다.

```typescript
class MarketDataService {
  // 실시간 SOXL 데이터 조회
  static async getCurrentSOXLData(): Promise<RealtimeQuote>

  // 과거 SOXL 데이터 조회
  static async getHistoricalSOXLData(days: number): Promise<MarketData[]>
}
```

**위치**: `src/services/marketDataService.ts`

### 데이터 흐름

```
1. 사용자 설정 입력
   ↓
2. MarketDataService → Yahoo Finance API
   ↓
3. RSI Calculator → RSI 계산 및 모드 결정
   ↓
4. DivisionEngine → 5분할 독립 백테스팅
   ↓
5. UI 컴포넌트 → 차트/테이블로 시각화
```

---

## 💻 사용 가이드

### 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/your-username/dongpa.git
cd dongpa

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 브라우저에서 http://localhost:3000 접속
```

### 환경 변수 설정

`.env.local` 파일 생성:

```env
# Alpha Vantage API 키 (무료: https://www.alphavantage.co/support/#api-key)
NEXT_PUBLIC_ALPHA_VANTAGE_KEY=your_api_key_here

# Yahoo Finance API (기본값 사용 가능)
NEXT_PUBLIC_YAHOO_FINANCE_ENABLED=true
```

### 페이지별 사용법

#### 1. 오늘 매매 신호 (`/`)

**기능**:
- 오늘 요일 및 분할 현황 확인
- 5분할 상태 대시보드 (보유량, 평단가, 수익률)
- 오늘 실행할 매매 신호 (매수/매도 주문 수량)

**사용 순서**:
1. 현재 RSI 모드 확인 (안전/공세)
2. 각 분할의 상태 확인 (EMPTY/HOLDING)
3. 오늘 매수/매도 시그널 확인
4. 실제 거래 실행 (외부 증권사)

#### 2. 백테스팅 (`/backtest`)

**기능**:
- 과거 데이터 기반 전략 성과 분석
- RSI 기반 모드 자동 전환 적용
- 자산 추이 차트 및 통계 대시보드
- 분할별 상세 디버깅 테이블 (CSV 다운로드)

**설정 항목**:
- 초기 투자금액 (예: $10,000)
- 분할 횟수 (고정: 5)
- 매매 모드 (안전/공세/자동)
- 재분할 주기 (기본: 10일)
- 백테스트 기간 (시작일 ~ 종료일)

**결과 해석**:
- **수익률**: 기간 동안의 총 수익률
- **MDD**: 최대 낙폭 (자산이 최고점에서 얼마나 떨어졌는지)
- **승률**: 수익 거래 비율
- **손익비**: 평균 이익 / 평균 손실

#### 3. 매매 기록 관리

**기능**:
- 수동으로 매매 기록 입력
- 날짜, 분할, 매수/매도, 수량, 가격, 메모
- 거래 내역 목록 및 삭제

**사용법**:
1. "매매 기록 추가" 버튼 클릭
2. 폼 입력 (날짜, 분할, 타입, 수량, 가격, 메모)
3. 저장 → localStorage에 기록
4. 리스트에서 확인/삭제

---

## 🛠️ 개발 가이드

### 개발 환경 설정

```bash
# Node.js 18+ 필요
node --version

# 의존성 설치
npm install

# 개발 서버 (Hot Reload)
npm run dev

# 타입 체크
npm run type-check

# 린트
npm run lint
```

### 코드 스타일

**TypeScript 컨벤션**:
- 변수/함수: `camelCase`
- 클래스/인터페이스: `PascalCase`
- 상수: `UPPER_SNAKE_CASE`
- 파일명: `camelCase.ts` 또는 `PascalCase.tsx` (컴포넌트)

**예시**:
```typescript
// ✅ Good
export interface DongpaConfig { ... }
export class DivisionEngine { ... }
export const DEFAULT_DIVISIONS = 5;
export function calculateRSI(...) { ... }

// ❌ Bad
export interface dongpa_config { ... }
export class division_engine { ... }
```

### 주요 타입 정의

```typescript
// src/types/index.ts

export interface DongpaConfig {
  initialCapital: number;     // 초기 투자금
  divisions: number;          // 분할 횟수 (5 고정)
  mode: 'safe' | 'aggressive' | 'auto';  // 매매 모드
  rebalancePeriod: number;    // 재분할 주기 (일)
}

export interface MarketData {
  date: string;    // YYYY-MM-DD
  price: number;   // 종가
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface DivisionPortfolio {
  cash: number;           // 현금
  holdings: number;       // 보유 주식 수
  avgPrice: number;       // 평단가
  buyDate: string | null; // 매수일
  status: 'EMPTY' | 'HOLDING';
  mode: 'safe' | 'aggressive';
}

export interface DailyTradeRecord {
  key: number;
  date: string;
  price: number;
  change: number;
  action: 'NET_BUY' | 'NET_SELL' | 'HOLD';
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
```

### 새로운 기능 추가하기

#### 1. 새로운 매매 전략 추가

`src/services/divisionEngine.ts` 수정:

```typescript
private getModeConfig(mode: DivisionEngineMode) {
  const configs = {
    safe: {
      sellTarget: 0.002,    // 0.2%
      buyTarget: 0.03,      // 3.0%
      holdingDays: 30
    },
    aggressive: {
      sellTarget: 0.025,    // 2.5%
      buyTarget: 0.05,      // 5.0%
      holdingDays: 7
    },
    // 새로운 모드 추가
    ultraAggressive: {
      sellTarget: 0.05,     // 5.0%
      buyTarget: 0.10,      // 10.0%
      holdingDays: 3
    }
  };

  return configs[mode];
}
```

#### 2. 새로운 RSI 조건 추가

`src/utils/rsiCalculator.ts` 수정:

```typescript
export function determineTradingMode(
  currentRSI: number | null,
  prevRSI: number | null
): 'safe' | 'aggressive' {
  if (!currentRSI || !prevRSI) return 'safe';

  const isRising = currentRSI > prevRSI;
  const isFalling = currentRSI < prevRSI;

  // 새로운 조건 추가
  if (currentRSI > 70 && isFalling) {
    return 'safe';  // 강한 과매수 구간에서 하락
  }

  // 기존 조건들...
}
```

#### 3. 새로운 차트 추가

`src/components/` 에 새 컴포넌트 생성:

```typescript
// src/components/NewChart.tsx
'use client'

import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export const NewChart: React.FC<{ data: any[] }> = ({ data }) => {
  return (
    <LineChart width={800} height={400} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="date" />
      <YAxis />
      <Tooltip />
      <Legend />
      <Line type="monotone" dataKey="value" stroke="#8884d8" />
    </LineChart>
  );
};
```

### 디버깅 팁

#### 1. RSI 계산 확인

```typescript
import { enrichDataWithRSI } from '@/utils/rsiCalculator';

const data = await MarketDataService.getHistoricalSOXLData(90);
const rsiData = enrichDataWithRSI(data);

console.log('Latest RSI:', rsiData[rsiData.length - 1]);
// { date: '2024-01-15', rsi: 58.3, mode: 'aggressive', ... }
```

#### 2. 백테스팅 로그

```typescript
// src/services/divisionEngine.ts
backtest(marketData: MarketData[], rsiModes?: Map<string, DivisionEngineMode>) {
  marketData.forEach((dayData, index) => {
    // 디버깅 로그
    console.log(`Day ${index}: ${dayData.date}, Price: ${dayData.price}`);
    console.log('Buy Signals:', buySignals);
    console.log('Sell Signals:', sellSignals);
  });
}
```

#### 3. 분할 상태 확인

브라우저 콘솔에서:
```javascript
// localStorage 확인
JSON.parse(localStorage.getItem('dongpa_divisions'))

// 현재 분할 상태
divisions.map(d => ({
  cash: d.cash,
  holdings: d.holdings,
  status: d.status
}))
```

### 배포

#### Vercel 배포 (권장)

```bash
# Vercel CLI 설치
npm i -g vercel

# 배포
vercel

# 프로덕션 배포
vercel --prod
```

또는 GitHub 연동:
1. GitHub에 Push
2. [Vercel](https://vercel.com)에서 저장소 Import
3. 환경 변수 설정 (NEXT_PUBLIC_ALPHA_VANTAGE_KEY)
4. 자동 배포 완료!

#### 환경 변수 (Vercel)

Vercel Dashboard → Settings → Environment Variables:
```
NEXT_PUBLIC_ALPHA_VANTAGE_KEY=your_key_here
NEXT_PUBLIC_YAHOO_FINANCE_ENABLED=true
```

### 테스트

현재 테스트 프레임워크는 설정되지 않았습니다. 추가하려면:

```bash
# Jest + React Testing Library 설치
npm install --save-dev jest @testing-library/react @testing-library/jest-dom

# 설정 파일 생성
touch jest.config.js
```

**예시 테스트** (`src/utils/__tests__/rsiCalculator.test.ts`):
```typescript
import { calculateRSI } from '../rsiCalculator';

describe('RSI Calculator', () => {
  it('should calculate RSI correctly', () => {
    const data = [
      { date: '2024-01-01', price: 100 },
      { date: '2024-01-02', price: 105 },
      // ... 14일치 데이터
    ];

    const result = calculateRSI(data);
    expect(result[14].rsi).toBeGreaterThan(0);
    expect(result[14].rsi).toBeLessThan(100);
  });
});
```

---

## 📝 라이센스

MIT License

---

## ⚠️ 면책조항

본 시스템은 **교육 및 분석 목적**으로만 제공됩니다.

- 실제 투자 결정은 개인의 책임입니다
- SOXL은 3배 레버리지 ETF로 높은 변동성과 리스크가 있습니다
- 투자 원금의 전부 또는 일부 손실이 발생할 수 있습니다
- 과거 백테스팅 결과가 미래 수익을 보장하지 않습니다

**투자는 신중하게!**
