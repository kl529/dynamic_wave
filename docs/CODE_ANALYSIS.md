# 코드베이스 분석 보고서

> 분석 일자: 2026-01-08
> 분석 대상: dongpa-soxl-app 전체 코드베이스

## 목차

1. [하드코딩된 값들](#1-하드코딩된-값들)
2. [버그 가능성](#2-버그-가능성)
3. [불필요/중복 코드](#3-불필요중복-코드)
4. [개선 필요 사항](#4-개선-필요-사항)
5. [수정 우선순위](#5-수정-우선순위)

---

## 1. 하드코딩된 값들

### 1.1 설정 기본값 중복

#### `src/app/page.tsx`
```typescript
// 라인 32-36, 44-49 - 기본값이 두 번 정의됨
const loadConfigFromStorage = (): DongpaConfig => {
  if (typeof window === 'undefined') {
    return {
      initialCapital: 10000,  // 중복 1
      divisions: 5,
      mode: 'auto',
      rebalancePeriod: 10
    };
  }
  // ... 중략 ...
  return {
    initialCapital: 10000,  // 중복 2
    divisions: 5,
    mode: 'auto',
    rebalancePeriod: 10
  };
};
```

**권장 수정:**
```typescript
// src/constants/defaults.ts 생성
export const DEFAULT_CONFIG: DongpaConfig = {
  initialCapital: 10000,
  divisions: 5,
  mode: 'auto',
  rebalancePeriod: 10
};
```

---

### 1.2 매매 조건 하드코딩

#### `src/app/page.tsx`
| 라인 | 코드 | 설명 |
|------|------|------|
| 181 | `changePercent <= -3.0` | 매수 조건 -3.0% 하드코딩 |
| 229 | `>= 0.002` | 매도 조건 0.2% 하드코딩 |
| 295 | `-3.0%`, `+0.2%` | 조건 텍스트도 하드코딩 |

**권장 수정:** `tradingConfig.ts`의 `getModeConfig()`를 활용

---

### 1.3 분할 수 하드코딩

#### `src/utils/divisionStateCalculator.ts`
```typescript
// 라인 14, 27, 30, 48
const divisions = Array(5).fill(null)...  // 5 하드코딩
if (divIndex >= 5) return;                // 5 하드코딩
```

#### `src/components/BacktestDebugTable.tsx`
```typescript
// 라인 566
분할 수: 5개  // UI 텍스트도 하드코딩
```

---

### 1.4 수수료율 하드코딩

#### `src/utils/tradingConfig.ts`
```typescript
// 라인 6-9
export const FEES = {
  commission: 0.00044,  // 0.044%
  secFee: 0.0000278     // 0.00278%
} as const;
```

**참고:** 이 값들은 상수로 관리되고 있어 현재 상태가 적절함. 다만 환경변수로 분리하면 더 유연함.

---

### 1.5 UI 스타일 하드코딩

#### `src/app/page.tsx`
```typescript
// 라인 166-169
background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'

// 라인 422
background: '#f5f5f5'

// 라인 469
minHeight: 400
```

---

### 1.6 시간/간격 하드코딩

#### `src/hooks/useDongpaEngine.ts`
```typescript
// 라인 164
const interval = setInterval(checkAndRefresh, 60000);  // 1분
```

#### `src/services/notifications.ts`
```typescript
// 라인 107-109
setTimeout(() => notification.close(), 10000);  // 10초

// 라인 240-242
setTimeout(resolve, 5000);  // 5초
```

#### `src/app/backtest/page.tsx`
```typescript
// 라인 26
90 * 24 * 60 * 60 * 1000  // 90일을 밀리초로

// 라인 247
buffer = 30  // 버퍼 일수

// 라인 250
365  // 최소 1년치
```

---

### 1.7 최소 거래 금액

#### `src/services/divisionEngine.ts`
```typescript
// 라인 219
if (division.cash < 100) {  // 최소 $100 하드코딩
  return null;
}
```

---

## 2. 버그 가능성

### 2.1 0으로 나누기 (Critical)

#### `src/app/page.tsx:229`
```typescript
// avgPrice가 0일 때 무한대 발생
((todayClose - d.avgPrice) / d.avgPrice >= 0.002)
```

**수정 필요:**
```typescript
(d.avgPrice > 0 && ((todayClose - d.avgPrice) / d.avgPrice >= 0.002))
```

#### `src/services/divisionEngine.ts:170`
```typescript
// totalCost가 0일 때 무한대 발생
const unrealizedPLRate = (unrealizedPL / div.totalCost) * 100;
```

#### `src/services/divisionEngine.ts:449,452`
```typescript
// sellQty가 0일 때 0으로 나누기
const avgProfit = (sellSignal.profit || 0) / sellQty;
const netProfitRate = sellSignal.profitRate * netQty / sellQty;
```

---

### 2.2 JSON 파싱 에러 미처리

#### 에러 처리 없는 JSON.parse 호출들:

| 파일 | 라인 |
|------|------|
| `src/app/page.tsx` | 41 |
| `src/utils/divisionStateCalculator.ts` | 26 |
| `src/services/notifications.ts` | 294, 297 |
| `src/components/TradeRecordList.tsx` | 27 |
| `src/components/TradeRecordForm.tsx` | 31 |

**권장 수정:**
```typescript
const safeJsonParse = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
};
```

---

### 2.3 useMemo 내 부작용

#### `src/hooks/useRSIMode.ts:178-180`
```typescript
// useMemo 내부에서 setState 호출 - React 규칙 위반
useMemo(() => {
  // ...
  setLoading(false);  // 부작용!
}, [...]);
```

---

### 2.4 타입 불일치

#### `src/components/BacktestPanel.tsx:24`
```typescript
// BacktestResult 타입이지만 실제로는 DivisionEngine 결과와 호환 안됨
```

---

## 3. 불필요/중복 코드

### 3.1 완전 미사용 코드

#### `src/components/TodaySignalPanel.tsx:36-64`
```typescript
// 선언만 하고 사용하지 않는 변수들
const primarySignal = ...;  // 미사용
const isPrimarySell = ...;  // 미사용
const isPrimaryBuy = ...;   // 미사용
const isHold = ...;         // 미사용

// 미사용 함수들
const getSignalColor = () => { ... };  // 미사용
const getSignalIcon = () => { ... };   // 미사용
const getSignalText = () => { ... };   // 미사용
const getAlertType = () => { ... };    // 미사용
```

**권장:** 전체 삭제

---

### 3.2 중복 정의

#### 모드 설정 중복

| 파일 | 라인 | 내용 |
|------|------|------|
| `src/utils/tradingConfig.ts` | 25-40 | `MODE_CONFIGS` 원본 |
| `src/components/BacktestDebugTable.tsx` | 87-89 | 중복 정의 |
| `src/types/index.ts` | 31-35 | `ModeConfig` 인터페이스 중복 |

#### auto → safe 변환 로직 중복

`src/services/dongpaEngine.ts`에서 동일 패턴 반복:
- `generateDailyTradeRecord()`
- `getTodayTradingSignals()`
- `getStrategyInfo()`

```typescript
// 반복되는 패턴
const activeMode = this.config.mode === 'auto' ? 'safe' : this.config.mode;
```

---

### 3.3 기본값 중복

#### `src/app/page.tsx:29-50`
`loadConfigFromStorage()` 함수 내 기본값이 두 번 정의됨

---

## 4. 개선 필요 사항

### 4.1 타입 안전성

| 파일 | 라인 | 현재 | 권장 |
|------|------|------|------|
| `src/app/page.tsx` | 55 | `useState<any[]>([])` | 구체적 타입 지정 |
| `src/components/RealtimePanel.tsx` | 19 | `tradingSignals: any` | 인터페이스 정의 |
| `src/services/marketDataService.ts` | 40, 66 | `data: any` | Yahoo API 응답 타입 정의 |

---

### 4.2 파일 크기

| 파일 | 라인 수 | 권장 |
|------|---------|------|
| `src/services/dongpaEngine.ts` | 500+ | 기능별 분리 |
| `src/services/divisionEngine.ts` | 700+ | 기능별 분리 |

---

### 4.3 상수 중앙화 필요

현재 매직 넘버들이 여러 파일에 분산되어 있음.

**권장 구조:**
```
src/
  constants/
    defaults.ts      # 기본 설정값
    trading.ts       # 매매 관련 상수
    ui.ts           # UI 관련 상수
    timing.ts       # 시간/간격 상수
```

---

### 4.4 접근성

색상만으로 상태를 구분하는 곳들:
- 손실/수익 표시 (빨강/초록)
- 매수/매도 신호 (파랑/빨강)

**권장:** 아이콘 + 텍스트 라벨 추가

---

## 5. 수정 우선순위

### Critical (즉시 수정)
1. **0으로 나누기 버그** - `avgPrice`, `totalCost`, `sellQty` 체크
2. **JSON.parse 에러 처리** - try-catch 추가

### High (빠른 시일 내)
3. **미사용 코드 제거** - TodaySignalPanel.tsx
4. **상수 중앙화** - 매직 넘버 정리
5. **any 타입 제거** - 구체적 타입 지정

### Medium (점진적 개선)
6. **중복 코드 제거** - 모드 설정, 기본값
7. **대형 파일 분리** - dongpaEngine, divisionEngine
8. **useMemo 부작용 수정** - useRSIMode.ts

### Low (시간 여유 시)
9. **UI 스타일 상수화**
10. **접근성 개선**

---

## 요약 통계

| 카테고리 | 발견 건수 |
|----------|----------|
| 하드코딩된 값 | 30+ |
| 버그 가능성 | 15+ |
| 중복 코드 | 10+ |
| 개선 필요 | 20+ |
