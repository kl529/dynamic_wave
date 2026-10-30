# 구조

## 원칙

**백테스트와 실전 신호는 같은 함수로 계산한다.** 검증 스크립트(`scripts/research/`)는 앱의 `src/` 코드를 그대로 import 한다. 실전 신호 함수는 "다음 정규장에 할 일"을 돌려주고, 백테스트는 같은 판단을 하루 늦춰 체결한다. 이 일치는 테스트로 고정돼 있다 (`src/__tests__/lib`, `src/__tests__/utils/weeklyMode.test.ts`).

## 디렉토리

```
src/
├── app/
│   ├── page.tsx                 메인: 추천 전략 · 동파법 · 매매 기록 · 설정 탭
│   ├── backtest/page.tsx        백테스트: 추천 전략(strategyBacktest) · 동파법(DivisionEngine)
│   ├── login/page.tsx
│   └── api/
│       ├── auth/login/          비밀번호 확인 → 해시 쿠키 발급
│       ├── db/trade-records/    매매 기록 CRUD (PostgreSQL, 입력 검증, 전체 조회)
│       └── yahoo-finance/       시세 프록시 (SOXL, ^NDX, QLD만 허용)
├── middleware.ts                로그인 쿠키 확인 (페이지와 API 모두)
├── lib/
│   ├── strategy.ts              ★ 추천 전략 정의와 실전 신호 (strategySignal, todayOrder)
│   ├── strategyBacktest.ts      추천 전략 백테스트 (앱 백테스팅 화면)
│   ├── backtest.ts              목표 비중 시뮬레이션·신호 지연·세금·지표 (앱과 scripts/research 공용)
│   ├── trend.ts                 SMA, 추세 신호, 추세 앙상블
│   ├── dongpaOrders.ts          동파법 다음 정규장 LOC/MOC 주문표
│   ├── marketTime.ts            NYSE 휴장일, 다음 정규장 날짜
│   ├── authToken.ts             로그인 쿠키 값 (SHA-256)
│   └── supabase.ts              매매 기록 타입 (파일명은 예전 이름)
├── services/
│   ├── divisionEngine.ts        ★ 동파법·하이브리드 백테스트 엔진
│   ├── marketDataService.ts     확정 일봉 조회 (장중 봉 제외, 반올림 없음)
│   └── supabaseService.ts       브라우저 → /api/db/trade-records 호출
├── utils/
│   ├── rsiCalculator.ts         주간 RSI와 모드 (완료된 주만 사용)
│   ├── tradingConfig.ts         동파법 모드별 파라미터, 수수료
│   └── divisionStateCalculator.ts  매매 기록 → 분할 상태
├── hooks/                       useMarketHistory, useRSIMode
└── components/                  화면 컴포넌트

scripts/
├── research/                    ★ 전략 검증 (bun으로 실행)
│   ├── lib.ts                   데이터 로드, 합성 레버리지, 동파법 실행 (계산은 src/lib/backtest.ts 재사용)
│   ├── run.ts                   전체 스터디 → docs/validation/results.{md,json}
│   ├── tune.ts                  파라미터 조정 검증 → docs/validation/tuning.{md,json}
│   ├── improve.ts               개선 후보 (변동성 필터·SGOV·TQQQ·수수료·낙폭 빈도) → docs/validation/improvements.{md,json}
│   ├── chart.ts                 자산 곡선 SVG
│   └── crosscheck_vectorbt.py   vectorbt 독립 재현 → docs/validation/crosscheck.md
└── archive/                     2026-04 이전 스크립트 (수치 무효, docs/archive/README.md)
```

## 데이터 흐름

```
야후 일봉 → /api/yahoo-finance → marketDataService (확정 봉만)
  ├─ ^NDX 400일 → strategySignal → 추천 전략 탭 (목표 비중, 주문 수량)
  ├─ QLD 5일    → 주문 수량 계산용 가격
  └─ SOXL 1000일 → useRSIMode(완료된 주 RSI) + 매매 기록 → dongpaOrders → 동파법 탭 주문표

매매 기록: 브라우저 → /api/db/trade-records (미들웨어 인증 + 입력 검증) → PostgreSQL (홈랩)
```

## 타이밍 규칙

| 대상 | 판단에 쓰는 정보 | 체결 |
|---|---|---|
| 추천 전략 | t일 ^NDX 확정 종가 | t+1일 종가 (MOC/LOC). 목표 비중이 바뀐 날만 매매 |
| 동파법 매수·매도 | t-1일 종가, 평단, 보유일 | t일 종가 (LOC 조건 충족 시) |
| 동파법 모드 | 지난주까지 완료된 주간 RSI | 그 주 내내 고정 |
