# 🚀 동파법 SOXL 자동매매 시스템

**5분할 독립 운영 × RSI 자동 모드 전환 × 백테스팅**

> SOXL (반도체 3배 레버리지 ETF) 전용 자동매매 전략 시스템

[![Next.js](https://img.shields.io/badge/Next.js-14.0-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Ant Design](https://img.shields.io/badge/Ant_Design-5.0-0170FE?logo=ant-design)](https://ant.design/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

![동파법 시스템](https://via.placeholder.com/800x400/4F46E5/FFFFFF?text=Dongpa+Trading+System)

## ✨ 주요 기능

### 🎯 핵심 기능
- **5분할 독립 운영**: 각 분할이 개별 포트폴리오로 독립 관리
- **RSI 자동 모드 전환**: 14일/14주 RSI로 안전↔공세 모드 자동 전환
- **실시간 매매 신호**: 오늘 실행할 매수/매도 주문 즉시 확인
- **종가 기준 매매**: Yahoo Finance/Alpha Vantage 실시간 데이터

### 📊 분석 기능
- **백테스팅**: 과거 데이터 기반 전략 성과 검증 (수익률, MDD, 승률)
- **상세 디버깅**: 분할별 일별 거래 내역 CSV 다운로드
- **RSI 시각화**: 모드 전환 시점 및 RSI 추이 차트

### 🛠️ 기타 기능
- **매매 기록 관리**: 수동 거래 내역 입력/저장 (localStorage)
- **모바일 최적화**: 반응형 디자인
- **PWA 지원**: 홈 화면 추가 가능

## 🎯 동파법 전략 요약

### 📌 기본 설정
- **종목**: SOXL (반도체 3배 레버리지 ETF)
- **분할**: 5분할 고정 (각 분할이 독립 운영)
- **매매 기준**: 종가(Close Price)
- **모드 전환**: RSI 기반 자동 (14일/14주 RSI)

### 🟢 안전모드 (Safe Mode)
```
매수: 전일 대비 -3.0% 이상 하락 시
매도: +0.2% 수익 또는 30거래일 경과 시
RSI: 50 아래 하락, 65 이상→하락, 40-50 구간 하락
```

### 🔴 공세모드 (Aggressive Mode)
```
매수: 전일 대비 -5.0% 이상 하락 시
매도: +2.5% 수익 또는 7거래일 경과 시
RSI: 50 위로 상승, 35 이하→상승, 30-60 구간 상승
```

### 🔄 5분할 독립 운영 예시
```
분할1: 보유 68주 @ $29.10 (5일 차) → 매도 조건 충족 시 전량 매도
분할2: 보유 70주 @ $28.20 (3일 차) → 독립 관리
분할3: 현금 $2,000 (비어있음) → 매수 신호 시 매수
분할4: 현금 $2,000 (비어있음) → 대기
분할5: 보유 65주 @ $30.50 (1일 차) → 독립 관리
```

**📖 자세한 전략은 [GUIDE.md](./GUIDE.md)를 참조하세요.**

## 🚀 빠른 시작

### 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/your-username/dongpa.git
cd dongpa

# 의존성 설치
npm install

# 개발 서버 실행 (http://localhost:3000)
npm run dev

# 프로덕션 빌드
npm run build
npm start
```

### Vercel 배포

```bash
# Vercel CLI 설치
npm i -g vercel

# 배포
vercel

# 프로덕션 배포
vercel --prod
```

또는 GitHub와 Vercel 연동으로 자동 배포:
1. GitHub에 Push
2. [Vercel](https://vercel.com)에서 GitHub 연동
3. 자동 배포 완료!

## 💻 기술 스택

| 분류 | 기술 |
|------|------|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript |
| **UI** | Ant Design + Tailwind CSS |
| **Charts** | Recharts |
| **State** | React Hooks |
| **Storage** | localStorage |
| **Data** | Yahoo Finance API / Alpha Vantage API |

**📖 자세한 아키텍처는 [GUIDE.md](./GUIDE.md#️-시스템-아키텍처)를 참조하세요.**

## 📱 화면별 기능

| 탭 | 주요 기능 |
|---|-----------|
| **오늘 매매 신호** | • 오늘 요일 & 분할 현황<br>• 5분할 대시보드 (보유량/평단가/수익률)<br>• 오늘 실행할 매수/매도 주문 |
| **백테스팅** | • 과거 데이터 성과 분석<br>• RSI 자동 모드 적용<br>• 차트 & 통계 (수익률/MDD/승률)<br>• CSV 다운로드 |
| **매매 기록** | • 수동 거래 내역 입력<br>• 날짜/분할/타입/수량/가격/메모<br>• 목록 조회 및 삭제 |
| **설정** | • 초기 투자금 설정<br>• 모드 선택 (안전/공세/자동)<br>• 거래 가이드 |

**📖 자세한 사용법은 [GUIDE.md](./GUIDE.md#-사용-가이드)를 참조하세요.**

## 📁 프로젝트 구조

```
dongpa/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── page.tsx              # 메인 (오늘 매매 신호)
│   │   └── backtest/page.tsx     # 백테스팅
│   ├── components/               # UI 컴포넌트
│   ├── services/                 # ⭐ 핵심 로직
│   │   ├── divisionEngine.ts     # 5분할 독립 운영
│   │   ├── dongpaEngine.ts       # 동파법 계산
│   │   └── marketDataService.ts  # 시장 데이터
│   ├── utils/
│   │   └── rsiCalculator.ts      # ⭐ RSI 계산
│   └── types/index.ts            # 타입 정의
├── public/                       # 정적 파일
├── GUIDE.md                      # 📖 완전한 가이드
└── README.md                     # 이 파일
```

**📖 자세한 구조는 [GUIDE.md](./GUIDE.md#️-시스템-아키텍처)를 참조하세요.**

## 🛠️ 개발 스크립트

```bash
npm run dev          # 개발 서버 (http://localhost:3000)
npm run build        # 프로덕션 빌드
npm run start        # 프로덕션 서버
npm run lint         # ESLint 검사
```

**개발자 가이드는 [GUIDE.md](./GUIDE.md#️-개발-가이드)를 참조하세요.**

## 📚 문서

| 문서 | 내용 |
|------|------|
| **[GUIDE.md](./GUIDE.md)** | 📖 완전한 가이드 (전략, 아키텍처, 사용법, 개발) |
| **[README.md](./README.md)** | 프로젝트 소개 및 빠른 시작 |

**모든 상세 정보는 [GUIDE.md](./GUIDE.md)에 통합되어 있습니다!**

## 🚨 투자 유의사항

⚠️ **중요한 경고**
- 본 시스템은 **교육 및 분석 목적**으로만 제작됨
- 실제 투자 결정은 개인의 책임
- SOXL은 3배 레버리지 ETF로 **높은 변동성과 리스크**
- 투자 원금의 전부 또는 일부 손실 가능
- **과거 백테스팅 결과가 미래 수익을 보장하지 않음**

## 📝 라이센스

MIT License

---

**📖 전체 문서**: [GUIDE.md](./GUIDE.md)
**💬 문의**: GitHub Issues

⚠️ **면책조항**: 이 소프트웨어는 교육 목적으로만 제공됩니다. 실제 투자에 대한 어떠한 보장도 하지 않으며, 투자로 인한 손실에 대해 개발자는 책임지지 않습니다.
