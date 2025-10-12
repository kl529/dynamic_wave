# 🚀 동파법 SOXL 매매 시스템

SOXL 전용 동파법(5분할) 자동 매매 계산기입니다. 종가 기준 매매 신호를 제공하고 포트폴리오를 관리할 수 있습니다.

![Next.js](https://img.shields.io/badge/Next.js-14.0-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![Ant Design](https://img.shields.io/badge/Ant%20Design-5.12-1890ff)

## 📋 주요 기능

- **5분할 독립 운영**: 각 분할을 독립적으로 관리하는 포트폴리오 시스템
- **종가 기준 매매**: 어제/오늘 종가로 매수/매도 신호 계산
- **실시간 매매 신호**: 오늘 실행할 매수/매도 주문 수량 표시
- **매매 기록 관리**: 수동으로 거래 내역 입력 및 관리
- **모바일 최적화**: 반응형 디자인으로 모든 기기 지원

## 🎯 동파법 전략

### 안전모드 (기본)
- **매수 조건**: 전일 대비 -3.0% 이상 하락
- **매도 조건**: +0.2% 수익 또는 30일 경과
- **5분할 독립 운영**

### 공세모드 (고급)
- **매수 조건**: 전일 대비 -5.0% 이상 하락
- **매도 조건**: +2.5% 수익 또는 7일 경과
- **높은 수익, 높은 위험**

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

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI Library**: Ant Design
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **State**: React Hooks
- **Storage**: localStorage

## 📱 사용법

### 1. 오늘 매매 신호 탭
- 오늘 요일 및 분할 현황 확인
- 5분할 상태 대시보드 (보유량, 평단가, 수익률)
- 오늘 실행할 매매 신호 (매수/매도 주문 수량)

### 2. 거래 내역 탭
- 과거 백테스팅 결과 확인 (개발 예정)

### 3. 매매 기록 탭
- 수동으로 매매 기록 입력
- 날짜, 분할, 매수/매도, 수량, 가격, 메모
- 거래 내역 목록 및 삭제

### 4. 설정 탭
- 초기 투자금액 설정
- 안전모드/공세모드 전환
- 동파법 거래 가이드

## 📊 5분할 독립 운영

각 분할은 독립된 포트폴리오로 관리됩니다:

```
분할 1: 현금 $0 | 보유 68주 @ $29.10
분할 2: 현금 $0 | 보유 72주 @ $27.85
분할 3: 현금 $2,000 | 비어있음
분할 4: 현금 $2,000 | 비어있음
분할 5: 현금 $0 | 보유 65주 @ $30.50
```

- 각 분할은 $2,000씩 할당
- 매수 신호 발생 시 비어있는 분할로 매수
- 매도 신호 발생 시 해당 분할 전량 매도

## 🚨 투자 유의사항

⚠️ **중요한 경고**
- 본 시스템은 교육 및 분석 목적으로 제작됨
- 실제 투자 결정은 개인의 책임
- SOXL은 3배 레버리지 ETF로 높은 변동성과 리스크
- 투자 원금의 전부 또는 일부 손실 가능

## 📁 프로젝트 구조

```
dongpa/
├── src/
│   ├── app/
│   │   ├── page.tsx              # 메인 페이지
│   │   └── globals.css           # 전역 스타일
│   ├── components/
│   │   ├── ConfigPanel.tsx       # 설정 패널
│   │   ├── TodaySignalPanel.tsx  # 매매 신호
│   │   ├── TodayOverview.tsx     # 오늘 개요
│   │   ├── DivisionStatusPanel.tsx # 5분할 대시보드
│   │   ├── TradeRecordForm.tsx   # 거래 기록 폼
│   │   └── TradeRecordList.tsx   # 거래 내역 목록
│   ├── hooks/
│   │   └── useDongpaEngine.ts    # 동파법 계산 훅
│   └── utils/
│       └── mockData.ts           # 더미 데이터
├── public/                       # 정적 파일
├── vercel.json                   # Vercel 설정
└── package.json
```

## 🛠️ 개발 스크립트

```bash
npm run dev          # 개발 서버 실행
npm run build        # 프로덕션 빌드
npm run start        # 프로덕션 서버 실행
npm run lint         # ESLint 검사
```

## 📝 라이센스

MIT License

## 📞 문의

이슈나 제안사항은 [GitHub Issues](https://github.com/your-username/dongpa/issues)에 등록해주세요.

---

⚠️ **면책조항**: 이 소프트웨어는 교육 목적으로만 제공됩니다. 실제 투자에 대한 어떠한 보장도 하지 않으며, 투자로 인한 손실에 대해 개발자는 책임지지 않습니다.
