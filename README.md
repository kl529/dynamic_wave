# 동파 — 매매 신호 & 검증

장기 복리를 목표로 한 개인 매매 시스템. 매일 장 마감 후 앱을 열어 **다음 정규장에 할 일**을 확인한다.

## 지금 쓰는 전략 (2026-10-30 결정)

**나스닥100 2배(QLD) 추세 앙상블.** ^NDX 종가가 이동평균 100·150·200·250·300일 중 몇 개 위에 있는지의 비율(0~100%)만큼 QLD를 보유하고, 나머지는 현금으로 둔다. 비중은 신호 다음 정규장 종가에 맞춘다.

| 1995~2026, 세후 | 연복리 | 최대 낙폭 |
|---|---|---|
| QLD 추세 앙상블 100% | 18.0% | -77% (2000~2003, 2014년 회복) |
| 전략 50% + S&P500 50% (기본 제안) | 15.8% | -62% |
| S&P500 보유 | 10.2% | -55% |
| 동파법 SOXL (기존 전략) | 5.0% | -37% |
| SOXL 보유 | -7.5% | -100% |

왜 이 전략인지, 기존 동파법·하이브리드가 왜 탈락했는지, 위험은 무엇인지는 [`docs/STRATEGY.md`](./docs/STRATEGY.md)에 있다. 전체 검증 표는 [`docs/validation/results.md`](./docs/validation/results.md)다.

## 앱

| 탭 | 내용 |
|---|---|
| 추천 전략 | 다음 정규장의 QLD 목표 비중, 이동평균별 위치, 보유·현금을 넣으면 주문 수량 |
| 동파법 | SOXL 분할 현황, 주간 RSI 모드, 다음 정규장 LOC/MOC 주문표 |
| 매매 기록 | 동파법 매매 입력·조회 (PostgreSQL) |
| 설정 | 동파법 자본·분할 수·모드 |
| 백테스팅 (상단 버튼) | 추천 전략(상품·이동평균·조정 주기·세금 선택)과 동파법·하이브리드 시뮬레이션 |

사용법: [`GUIDE.md`](./GUIDE.md)

## 실행

```bash
npm install
cp .env.example .env.local   # SITE_PASSWORD, PostgreSQL 값 입력
npm run dev                  # http://localhost:3000
```

| 명령 | 용도 |
|---|---|
| `npm test` | 단위·회귀 테스트 (미래 데이터 미사용, 실전↔백테스트 일치, 주문표↔엔진 일치, API 입력 검증) |
| `npx tsc --noEmit -p .` | 타입 검사 |
| `npm run build` | 프로덕션 빌드 |
| `bun scripts/research/run.ts [--refresh]` | 전략 검증 전체 재실행 → `docs/validation/results.{md,json}` |
| `bun scripts/research/tune.ts` | 파라미터 조정 검증 → `docs/validation/tuning.{md,json}` |

환경 변수는 [`.env.example`](./.env.example), DB와 홈랩 Docker 배포는 [`docs/DB_SETUP.md`](./docs/DB_SETUP.md)를 본다.

## 문서

| 파일 | 내용 |
|---|---|
| [`docs/STRATEGY.md`](./docs/STRATEGY.md) | 전략 결정, 채택 기준, 결과, 위험 |
| [`docs/validation/results.md`](./docs/validation/results.md) | 자동 생성 검증 결과 전체 |
| [`docs/validation/tuning.md`](./docs/validation/tuning.md) | 파라미터 조정 검증 (동파법 900개 조합, 추세 민감도) |
| [`docs/validation/crosscheck.md`](./docs/validation/crosscheck.md) | vectorbt 독립 재현 |
| [`GUIDE.md`](./GUIDE.md) | 매일 할 일과 주문 방법 |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 코드 구조와 타이밍 규칙 |
| [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) | 변경 이력 |
| [`docs/archive/`](./docs/archive/README.md) | 2026-04 이전 연구 (수치 무효) |

## 기술 스택

Next.js 14 (App Router) · TypeScript · Ant Design 5 · Tailwind CSS · Recharts · PostgreSQL · Docker · Yahoo Finance · 검증 스크립트는 Bun

## 유의사항

과거 데이터 검증이며 미래 수익을 보장하지 않는다. QLD(2배)·SOXL(3배) 같은 레버리지 ETF는 큰 손실이 날 수 있다. 투자 결정과 결과는 본인 책임이다.
