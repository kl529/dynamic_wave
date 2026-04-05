# 동파법 파라미터 최적화 세션 기록

**날짜**: 2026-04-04
**목표**: 연간 수익률 10% 달성 (폭락장 제외 기준)

---

## 작업 요약

### 1. bull 모드 구현

RSI 주간 기준 55-65 구간에서 상승 중일 때 활성화되는 새 모드 추가.

**구현 위치**:
- `src/utils/rsiCalculator.ts` → `determineWeeklyMode()`: RSI 55-65 상승 구간 감지 시 `'bull'` 반환
- `src/utils/tradingConfig.ts` → `MODE_CONFIGS`에 bull 모드 파라미터 추가
- `src/services/divisionEngine.ts` → `DivisionEngineMode` 타입에 `'bull'` 추가
- `scripts/backtest-report.ts` → bull 모드 지원 및 v3 파라미터 적용

**발견**: bull 모드의 기본값(`sellTarget +0.5%, holdingDays 15일`)으로는 오히려 역효과.
상승장에서 -2% 하락 시 매수 → 추가 하락으로 손절 증가, 기존보다 나빠짐.

---

### 2. bull 모드 단독 탐색 (1차)

**탐색 변수**: `sellTarget` × `holdingDays`
**기준 구간**: 2023년 (상승장, B&H +235%)

| sellTarget | holdingDays | 2023 수익률 |
|-----------|------------|------------|
| +0.5% (기존) | 15일 | -10.1% |
| +10% | 30일 | -4.2% |
| +10% | 45일 | -4.2% (30→45 차이 없음) |

**결론**: `sellTarget +10%, holdingDays 30일` 이상이 최선. holdingDays 30일과 45일 이상 동일 (30일 내 목표 달성 or 손절 결정됨).

---

### 3. 전체 파라미터 그리드 탐색 v1

**탐색 조합**: 43,740개
**평가 구간**: 2023 상승장 / 2024 박스권 / 최근 1년 (폭락장 제외)
**결과 파일**: `docs/optimize-results.csv`

**탐색 범위**:
```
divisions:       [5, 7, 10]
rebalancePeriod: [5, 10, 20]
safe_buy:        [-2%, -3%, -4%]
safe_sell:       [+0.3%, +0.5%, +0.8%]
aggr_buy:        [-3%, -5%, -7%]
aggr_sell:       [+1.5%, +2.5%, +4%]    ← 상한 +4%
bull_buy:        [-1%, -2%, -3%]
bull_sell:       [+5%, +8%, +10%, +15%, +20%]
bull_hold:       [10, 15, 20, 30, 45일] ← 상한 45일
```

**주요 발견**:
- `safe_sell +0.8%`가 상위권 독점 → 이후 고정값으로 사용
- `aggr_sell +4%`가 탐색 상한에서 최선 → 더 높은 값 탐색 필요
- `bull_hold 45일`이 상위권 독점 → 더 긴 값 탐색 필요
- worst-case 1위: `aggr_buy -7%, aggr_sell +4%, bull_buy -3%, bull_sell +10%, bull_hold 45일`
  - 2023 +1.1% / 2024 +0.4% / 1yr +5.3% (**3구간 모두 플러스**)

---

### 4. 전체 파라미터 그리드 탐색 v2 (확장)

**탐색 조합**: 43,740개 (safe_sell 고정으로 차원 줄이고 aggr_sell/bull_sell/bull_hold 확장)
**결과 파일**: `docs/optimize-results-v2.csv`

**탐색 범위 (변경 부분)**:
```
safe_sell:       [+0.8%]                         ← 고정
aggr_sell:       [+4%, +6%, +8%, +10%, +15%, +20%]  ← 확장
bull_sell:       [+8%, +10%, +15%, +20%, +25%, +30%] ← 확장
bull_hold:       [30, 45, 60, 90, 120일]         ← 확장
```

**주요 발견**:
- `bull_hold 45/60/90/120일` 모두 동일 결과 → **45일이면 충분**
- `aggr_sell +10%`가 평균 기준 최선, `aggr_sell +20%`가 worst-case 기준 최선
- `aggr_sell +20%`는 10거래일 내 달성 현실성 낮음 → **추가 검토 필요**

**최종 후보 2개**:

#### 후보 A — 평균 수익률 최선
```
div=5, rp=20
safe:  buy -4%,  sell +0.8%, hold 30일
aggr:  buy -5%,  sell +10%,  hold 10일
bull:  buy -1%,  sell +10%,  hold 45일
```
| 구간 | 수익률 |
|------|--------|
| 2023 상승장 | +0.7% |
| 2024 박스권 | -0.9% |
| 최근 1년 | **+27.1%** |
| 평균 | **+8.9%** |

#### 후보 B — worst-case 최선 (3구간 모두 플러스)
```
div=5, rp=10
safe:  buy -3%,  sell +0.8%, hold 30일
aggr:  buy -3%,  sell +20%,  hold 10일   ← aggr_sell 현실성 재검토 필요
bull:  buy -3%,  sell +10%,  hold 45일
```
| 구간 | 수익률 |
|------|--------|
| 2023 상승장 | +3.0% |
| 2024 박스권 | **+1.5%** |
| 최근 1년 | +15.4% |
| 평균 | +6.6% |

---

## 미결 과제

### 1. aggr_sell 현실성 검토
- `aggr_sell +20%`는 최대 보유기간 10거래일 내 달성 어려움
- **할 일**: `aggr_sell +5%~+12%` 현실적 범위 재탐색

### 2. 백테스팅 구간 확장
- 현재: 2023 / 2024 / 최근 1년 3개 구간만 평가
- **할 일**: 2020-2021 (코로나 이후 대상승장) 추가
- 폭락장(2022)은 최적화 기준 제외, 참고용으로만

### 3. 확정 후 코드 반영
- `src/utils/tradingConfig.ts` MODE_CONFIGS 업데이트
- `src/utils/rsiCalculator.ts` bull 모드 감지 로직 확인
- 프론트엔드 UI 반영 여부 검토

---

## 현재 코드 기준값 (v3, 2026-04-04)

```typescript
// src/utils/tradingConfig.ts
safe:       { sellTarget: 0.005, buyTarget: -0.03, holdingDays: 30 }
aggressive: { sellTarget: 0.025, buyTarget: -0.05, holdingDays: 10 }
bull:       { sellTarget: 0.005, buyTarget: -0.02, holdingDays: 15 }  // 최적화 필요
```

백테스트 기준:
- 2023 상승장: -0.09%
- 2024 박스권: -4.07%
- 최근 1년: +5.26%
