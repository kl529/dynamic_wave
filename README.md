# 동파법 SOXL 자동매매 시스템

**5분할 독립 운영 × RSI 자동 모드 전환 × 백테스팅**

> SOXL (반도체 3배 레버리지 ETF) 전용 자동매매 전략 시스템

[![Next.js](https://img.shields.io/badge/Next.js-14.0-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Ant Design](https://img.shields.io/badge/Ant_Design-5.0-0170FE?logo=ant-design)](https://ant.design/)

---

## 현재 전략 파라미터 (v3 — 2026-04-04 기준)

| 항목 | 안전모드 | 공세모드 | bull모드 |
|------|---------|---------|---------|
| **매수 조건** | 전일 대비 **-3% 이상 하락일에만** | **-5% 이상 하락일에만** | **-3% 이상 하락일에만** |
| **매도 목표** | 평단가 대비 **+0.8%** | **+10%** | **+10%** |
| **최대 보유** | **30거래일** 후 강제 손절 | **10거래일** | **45거래일** |
| 모드 전환 | Weekly RSI 기반 자동 전환 | ← | RSI 55~65 상승 구간 |
| 기본 분할 수 | **5분할** (최적화 목표: 10분할) | ← | ← |
| 재분할 주기 | **20거래일**마다 자산 균등 재분배 | ← | ← |
| 수수료 | 편도 0.047% (거래세 0.044% + SEC 0.00278%) | ← | ← |

> **권장 파라미터 (그리드 탐색 v3 결론)**: `div=10, rp=10` | safe `-4%/+0.8%/30일` | aggr `-5%/+10%/10일` | bull `-3%/+8%/45일`

---

## 실제 백테스팅 결과 요약

### 연도별 (2010~2026, 4,041거래일)

| 구간 | SOXL B&H | 동파법 | 초과수익 |
|------|---------|--------|---------|
| 2011 하락장 | -49% | -27.5% | **+21.9%p** |
| 2018 하락장 | -44% | -10.1% | **+34.1%p** |
| **2022 폭락장** | **-87%** | **-36.1%** | **+50.5%p** |
| 2012 횡보장 | 0% | -18.6% | -18.6%p |
| 2024 보합장 | -2.6% | -12.5% | -9.9%p |
| 2023 강세장 | +235% | +2.5% | -232%p |

**전략 포지셔닝**: B&H 대비 연간 -40% 이상 폭락 시에만 우위. 단독 수익 전략이 아닌 **폭락 방어 + 박스권 알파** 전략.

> 상세 분석: [`docs/analysis-2026-04-04-v4.md`](./docs/analysis-2026-04-04-v4.md)

---

## 기능

### 오늘 매매 신호 (메인 화면)
- 5분할(~7분할) 현황 대시보드 (보유량 / 평단가 / 평가손익)
- 오늘 실행할 매수/매도 주문 즉시 확인
- RSI 모드 표시 (안전 / 공세)
- 매매 기록 수동 입력 및 Supabase 저장

### 백테스팅
- 기간 / 분할 수 / 모드 / 재분할 주기 자유 설정
- **고급 설정**: 매도 목표 % 직접 커스텀 (기본값 오버라이드)
- **파라미터 스윕**: 15개 조합 자동 테스트 → 최적 파라미터 탐색
- 핵심 지표: 수익률, 연환산(CAGR), MDD, 승률, **기대값(EV)**, 손절 비율
- 분할별 성과 테이블 + CSV 다운로드

---

## 빠른 시작

```bash
npm install
npm run dev   # http://localhost:3000
```

환경 변수 (`.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

> Supabase 설정 상세: [`docs/SUPABASE_SETUP.md`](./docs/SUPABASE_SETUP.md)

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| UI | Ant Design 5 + Tailwind CSS |
| Charts | Recharts |
| Database | Supabase (PostgreSQL) |
| Data | Yahoo Finance API |

---

## 문서

| 파일 | 내용 |
|------|------|
| [`GUIDE.md`](./GUIDE.md) | 전략 상세, 사용법, 아키텍처 |
| [`docs/analysis-2026-04-04-v4.md`](./docs/analysis-2026-04-04-v4.md) | **2010~2026 전체 분석, 구조적 문제 진단, 개선 방향** |
| [`docs/how-money-is-made.md`](./docs/how-money-is-made.md) | 매수/매도 수식 완전 해부, 손익분기점 |
| [`docs/backtest-report-2026-04-04.md`](./docs/backtest-report-2026-04-04.md) | v2 vs v3 비교 백테스팅 결과 |
| [`docs/optimization-2026-04-04.md`](./docs/optimization-2026-04-04.md) | 파라미터 그리드 탐색 v1/v2 기록 |
| [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) | 변경 이력 |
| [`docs/SUPABASE_SETUP.md`](./docs/SUPABASE_SETUP.md) | Supabase 연결 설정, 테이블 생성 SQL |

---

## 투자 유의사항

- 본 시스템은 **교육 및 분석 목적**으로만 제작됨
- SOXL은 3배 레버리지 ETF — **원금 전액 손실 가능**
- 과거 백테스팅 결과가 미래 수익을 보장하지 않음
- 실제 투자 결정은 전적으로 개인의 책임
