# 🚀 동파법 SOXL 자동매매 웹앱 개발 가이드

## 📋 프로젝트 개요

### **🎯 프로젝트 목표**
- SOXL 전용 동파법 자동 매매 계산기
- 실시간 데이터 연동으로 정확한 매매 타이밍 제공
- 백테스팅을 통한 전략 검증
- PWA 알림 기능으로 모바일 최적화
- 직관적인 한국어 UI

### **💻 기술 스택**
```
Frontend: React 18 + TypeScript + Tailwind CSS + Ant Design + Recharts
Backend: Node.js + Express (API 서버)
Data: Alpha Vantage API (실시간 주식 데이터)
Deploy: Vercel (Frontend) + Railway (Backend)
PWA: Service Worker + Web Notifications
```

### **🔑 핵심 기능**
1. ✅ 투자금액 입력 → 5분할 자동 계산
2. ✅ 안전모드/공세모드 전환
3. ✅ 종가 기준 실시간 매수/매도 신호
4. ✅ 최대 보유기간 자동 손절 기능
5. ✅ 3개월 백테스팅 성과 분석
6. ✅ 브라우저 푸시 알림
7. ✅ PWA 모바일 앱 설치

---

## 📊 동파법 핵심 로직 분석

### **⚙️ 기본 설정**
- **분할 횟수**: 5분할 (고정)
- **분할 방식**: **각 분할 독립 운영** (개별 매수일, 개별 평단가, 개별 매도)
- **매매 기준**: 종가 (Close Price) 기준
- **최초 투자금**: 사용자 설정 (기본 $10,000)
- **거래 종목**: SOXL (반도체 3배 레버리지 ETF)

### **🧮 매매 조건 공식 (분할별 독립)**

#### **매수 조건 (분할별 체크)**
```javascript
// 각 분할별로 독립적으로 매수 조건 체크
for (let i = 0; i < 5; i++) {
  const division = divisions[i];

  // 해당 분할이 비어있고 조건 충족 시
  if (division.status === 'EMPTY' &&
      전일종가대비하락률 <= -매수목표하락률 &&
      division.cash >= 분할금액) {

    // 해당 분할만 매수
    division.holdings = Math.floor(분할금액 / 오늘종가);
    division.avgPrice = 오늘종가;
    division.buyDate = 오늘날짜;
    division.status = 'HOLDING';
  }
}

// 모드별 매수 목표
안전모드: -3.0% 이상 하락
공세모드: -5.0% 이상 하락
```

#### **매도 조건 (분할별 체크)**
```javascript
// 각 분할별로 독립적으로 매도 조건 체크
for (let i = 0; i < 5; i++) {
  const division = divisions[i];

  if (division.status === 'HOLDING') {
    const 수익률 = (오늘종가 - division.avgPrice) / division.avgPrice;
    const 보유일수 = 오늘날짜 - division.buyDate;

    // 조건 충족 시 해당 분할만 매도
    if (수익률 >= 매도목표수익률 || 보유일수 >= 최대보유기간) {
      division.holdings = 0;
      division.avgPrice = 0;
      division.buyDate = null;
      division.cash = 매도금액 - 수수료;
      division.status = 'EMPTY';
    }
  }
}

// 모드별 매도 목표
안전모드: +0.2% 또는 30일 경과
공세모드: +2.5% 또는 7일 경과
```

#### **순매매량 계산**
```javascript
// 하루에 여러 분할이 동시에 매수/매도 가능
총_매수량 = 매수한_모든_분할의_주식_합계;
총_매도량 = 매도한_모든_분할의_주식_합계;
순매매량 = 총_매수량 - 총_매도량;

// 실제 주문
if (순매매량 > 0) {
  시장가_매수(순매매량);  // 순매수
} else if (순매매량 < 0) {
  시장가_매도(Math.abs(순매매량));  // 순매도
}
```

### **💰 수수료 및 비용**
- **거래 수수료**: 0.044% (미국 주식 일반적 수수료)
- **SEC Fee**: 0.00278% (미국 증권거래위원회 수수료)
- **총 편도 수수료**: 0.047%

---

## 🏗️ 프로젝트 구조

### **📁 Frontend 디렉토리 구조**
```
dongpa-soxl-app/
├── public/
│   ├── manifest.json              # PWA 매니페스트
│   ├── sw.js                     # Service Worker
│   ├── icon-192x192.png          # PWA 아이콘
│   └── icon-512x512.png
├── src/
│   ├── components/
│   │   ├── DongpaApp.jsx         # 메인 앱 컴포넌트
│   │   ├── TodayOverview.jsx     # 오늘 요일 & 분할 현황
│   │   ├── DivisionStatus.jsx    # 5분할 상태 대시보드
│   │   ├── TradeRecordForm.jsx   # 매매 기록 입력 폼
│   │   ├── TradingTable.jsx      # 매매 테이블
│   │   ├── BacktestChart.jsx     # 백테스팅 차트
│   │   ├── PortfolioSummary.jsx  # 포트폴리오 요약
│   │   └── NotificationSettings.jsx # 알림 설정
│   ├── services/
│   │   ├── marketApi.js          # 실시간 데이터 API
│   │   ├── dongpaEngine.js       # 동파법 계산 엔진
│   │   ├── tradeRecordStorage.js # 매매 기록 저장 (localStorage)
│   │   └── notifications.js      # 푸시 알림 관리
│   ├── utils/
│   │   ├── constants.js          # 설정 상수들
│   │   ├── dateUtils.js          # 날짜/요일 유틸
│   │   └── helpers.js            # 유틸 함수들
│   ├── hooks/
│   │   ├── useDongpaCalculator.js # 계산 훅
│   │   ├── useTradeRecords.js    # 매매 기록 훅
│   │   └── useRealtimeData.js    # 실시간 데이터 훅
│   ├── styles/
│   │   └── globals.css           # 전역 스타일
│   ├── App.js
│   └── index.js
├── package.json
└── README.md
```

### **📁 Backend 디렉토리 구조**
```
dongpa-api/
├── src/
│   ├── routes/
│   │   ├── soxl.js              # SOXL 데이터 라우트
│   │   └── notifications.js     # 알림 라우트
│   ├── services/
│   │   ├── alphaVantage.js      # Alpha Vantage API
│   │   ├── dataProcessor.js     # 데이터 처리
│   │   └── scheduler.js         # 크론 작업
│   ├── middleware/
│   │   ├── cors.js              # CORS 설정
│   │   └── rateLimit.js         # API 호출 제한
│   └── server.js
├── package.json
└── .env                         # 환경 변수
```

---

## 🔧 설치 및 설정

### **1. 프로젝트 초기 설정**
```bash
# Frontend 설정
npx create-react-app dongpa-soxl-app
cd dongpa-soxl-app

# 필수 패키지 설치
npm install antd recharts axios lucide-react dayjs
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Backend 설정 (별도 터미널)
mkdir dongpa-api && cd dongpa-api
npm init -y
npm install express cors axios node-cron dotenv compression helmet
npm install -D nodemon concurrently
```

### **2. 환경 변수 설정**
```bash
# .env (Backend)
ALPHA_VANTAGE_API_KEY=your_api_key_here
CORS_ORIGIN=http://localhost:3000
PORT=5000

# .env.local (Frontend)
REACT_APP_API_URL=http://localhost:5000
REACT_APP_ALPHA_VANTAGE_KEY=your_api_key_here
```

### **3. Alpha Vantage API 키 발급**
```
1. https://www.alphavantage.co/support/#api-key 방문
2. 무료 계정 생성 (일 500회 호출 제한)
3. API 키 복사하여 환경 변수에 설정
```

---

## 💻 핵심 코드 구현

### **0. 메인 앱 컴포넌트 (DongpaApp.jsx) - 탭 구조 및 통합**

```jsx
import React, { useState } from 'react';
import { Layout, Tabs, Card, InputNumber, Radio, Button, Space, Alert } from 'antd';
import { ReloadOutlined, SettingOutlined, BarChartOutlined, FileTextOutlined } from '@ant-design/icons';
import { useDongpaCalculator } from '../hooks/useDongpaCalculator';
import { TodayOverview } from './TodayOverview';
import { DivisionStatus } from './DivisionStatus';
import { TradeRecordForm } from './TradeRecordForm';
import { TradeRecordList } from './TradeRecordList';
import { TradingTable } from './TradingTable';
import { BacktestChart } from './BacktestChart';
import { PortfolioSummary } from './PortfolioSummary';
import './DongpaApp.css';

const { Content } = Layout;
const { TabPane } = Tabs;

export const DongpaApp = () => {
  const [activeTab, setActiveTab] = useState('live');
  const {
    config,
    currentPrice,
    loading,
    lastUpdate,
    liveResults,
    backtestResults,
    updateRealtimeData,
    setInitialCapital,
    setTradingMode
  } = useDongpaCalculator({
    initialCapital: 10000,
    mode: 'safe'
  });

  return (
    <Layout className="dongpa-app">
      <Content className="app-content">
        <div className="app-container">
          {/* 헤더 */}
          <Card className="app-header">
            <h1 className="app-title">🚀 동파법 SOXL 자동매매</h1>
            <p className="app-subtitle">실시간 매매 신호 & 백테스팅</p>
          </Card>

          {/* 탭 네비게이션 */}
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            type="card"
            className="main-tabs"
            size="large"
          >
            {/* 실시간 매매 탭 */}
            <TabPane
              tab={
                <span>
                  <BarChartOutlined />
                  실시간 매매
                </span>
              }
              key="live"
            >
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {/* 오늘 요일 & 분할 현황 */}
                <TodayOverview
                  divisionPortfolios={liveResults.divisionPortfolios || []}
                  currentPrice={currentPrice}
                />

                {/* 5분할 상태 대시보드 */}
                <DivisionStatus
                  divisionPortfolios={liveResults.divisionPortfolios || []}
                  currentPrice={currentPrice}
                  mode={config.mode}
                />

                {/* 매매 테이블 */}
                <TradingTable
                  trades={liveResults.trades || []}
                  loading={loading}
                />

                {/* 포트폴리오 요약 */}
                <PortfolioSummary
                  summary={liveResults.summary}
                  finalValue={liveResults.finalValue}
                  maxDrawdown={liveResults.maxDrawdown}
                />
              </Space>
            </TabPane>

            {/* 백테스팅 탭 */}
            <TabPane
              tab={
                <span>
                  <FileTextOutlined />
                  백테스팅
                </span>
              }
              key="backtest"
            >
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <BacktestChart
                  trades={backtestResults.trades || []}
                  loading={loading}
                />
                <PortfolioSummary
                  summary={backtestResults.summary}
                  finalValue={backtestResults.finalValue}
                  maxDrawdown={backtestResults.maxDrawdown}
                />
              </Space>
            </TabPane>

            {/* 매매 기록 탭 */}
            <TabPane
              tab={
                <span>
                  <FileTextOutlined />
                  매매 기록
                </span>
              }
              key="records"
            >
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <TradeRecordForm onSave={() => window.location.reload()} />
                <TradeRecordList />
              </Space>
            </TabPane>

            {/* 설정 탭 */}
            <TabPane
              tab={
                <span>
                  <SettingOutlined />
                  설정
                </span>
              }
              key="settings"
            >
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Card title="⚙️ 매매 설정">
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <div>
                      <label className="setting-label">초기 투자금</label>
                      <InputNumber
                        value={config.initialCapital}
                        onChange={setInitialCapital}
                        formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={value => value.replace(/\$\s?|(,*)/g, '')}
                        min={1000}
                        max={1000000}
                        step={1000}
                        style={{ width: '100%' }}
                        size="large"
                      />
                    </div>

                    <div>
                      <label className="setting-label">매매 모드</label>
                      <Radio.Group
                        value={config.mode}
                        onChange={e => setTradingMode(e.target.value)}
                        buttonStyle="solid"
                        size="large"
                        style={{ width: '100%' }}
                      >
                        <Radio.Button value="safe" style={{ width: '50%', textAlign: 'center' }}>
                          안전모드
                        </Radio.Button>
                        <Radio.Button value="aggressive" style={{ width: '50%', textAlign: 'center' }}>
                          공세모드
                        </Radio.Button>
                      </Radio.Group>
                    </div>

                    <Button
                      type="primary"
                      icon={<ReloadOutlined />}
                      onClick={updateRealtimeData}
                      loading={loading}
                      size="large"
                      block
                    >
                      데이터 새로고침
                    </Button>
                  </Space>
                </Card>

                {/* 거래 가이드 */}
                <Card title="📖 동파법 거래 가이드">
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Alert
                      message="안전모드 (초보자 추천)"
                      description={
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          <li>매수 조건: 전일 대비 -3.0% 이상 하락</li>
                          <li>매도 조건: +0.2% 수익 또는 30일 경과</li>
                          <li>분할별 독립 운영</li>
                        </ul>
                      }
                      type="success"
                      showIcon
                    />

                    <Alert
                      message="공세모드 (경험자 전용)"
                      description={
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          <li>매수 조건: 전일 대비 -5.0% 이상 하락</li>
                          <li>매도 조건: +2.5% 수익 또는 7일 경과</li>
                          <li>높은 수익, 높은 위험</li>
                        </ul>
                      }
                      type="warning"
                      showIcon
                    />

                    <Alert
                      message="💡 핵심 원칙"
                      description={
                        <div>
                          <p><strong>1. 분할별 독립 운영:</strong> 각 분할은 개별 포트폴리오로 관리</p>
                          <p><strong>2. 종가 기준:</strong> 모든 매매 판단은 종가 기준</p>
                          <p><strong>3. 순매매 실행:</strong> 하루 총매수량 - 총매도량 = 실제 주문량</p>
                          <p><strong>4. 자동 손절:</strong> 최대 보유기간 도달 시 자동 매도</p>
                        </div>
                      }
                      type="info"
                      showIcon
                    />
                  </Space>
                </Card>
              </Space>
            </TabPane>
          </Tabs>

          {/* 푸터 */}
          <div className="app-footer">
            <p>마지막 업데이트: {lastUpdate?.toLocaleString('ko-KR') || '로딩 중...'}</p>
            <p>현재 가격: ${currentPrice?.toFixed(2) || '--'}</p>
          </div>
        </div>
      </Content>
    </Layout>
  );
};
```

### **0-1. 모바일 최적화 CSS (DongpaApp.css)**

```css
/* 기본 레이아웃 */
.dongpa-app {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.app-content {
  padding: 16px;
}

.app-container {
  max-width: 1400px;
  margin: 0 auto;
}

.app-header {
  text-align: center;
  margin-bottom: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.app-title {
  font-size: 32px;
  font-weight: bold;
  margin: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.app-subtitle {
  font-size: 16px;
  color: #888;
  margin: 8px 0 0 0;
}

.main-tabs {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.setting-label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 14px;
}

.app-footer {
  text-align: center;
  color: white;
  padding: 24px 0;
  font-size: 14px;
}

.app-footer p {
  margin: 4px 0;
}

/* 모바일 최적화 (768px 이하) */
@media (max-width: 768px) {
  .app-content {
    padding: 8px;
  }

  .app-title {
    font-size: 24px;
  }

  .app-subtitle {
    font-size: 14px;
  }

  .main-tabs {
    padding: 8px;
  }

  /* 탭 버튼 크기 조정 */
  .main-tabs .ant-tabs-tab {
    padding: 8px 12px;
    font-size: 14px;
  }

  /* 카드 간격 조정 */
  .ant-space-item {
    width: 100%;
  }

  /* 테이블 가로 스크롤 */
  .ant-table-wrapper {
    overflow-x: auto;
  }

  /* InputNumber 모바일 최적화 */
  .ant-input-number {
    width: 100% !important;
  }

  /* Radio 버튼 세로 배치 */
  .ant-radio-group-solid {
    display: flex;
    flex-direction: column;
  }

  .ant-radio-button-wrapper {
    width: 100% !important;
    text-align: center;
    margin-bottom: 8px;
  }

  /* TodayOverview 모바일 레이아웃 */
  .today-overview .ant-row {
    flex-direction: column;
  }

  .today-overview .ant-col {
    width: 100% !important;
    max-width: 100% !important;
    margin-bottom: 16px;
  }

  /* 분할 상태 테이블 */
  .ant-table {
    font-size: 12px;
  }

  .ant-table-thead > tr > th {
    padding: 8px 4px;
  }

  .ant-table-tbody > tr > td {
    padding: 8px 4px;
  }

  /* Progress Bar 크기 */
  .ant-progress-line {
    font-size: 12px;
  }

  /* 매매 기록 폼 */
  .ant-form-item {
    margin-bottom: 16px;
  }

  .ant-space-horizontal {
    flex-direction: column !important;
  }

  .ant-space-horizontal .ant-space-item {
    width: 100%;
  }

  /* Alert 메시지 */
  .ant-alert {
    font-size: 13px;
  }

  .ant-alert ul {
    font-size: 12px;
  }

  /* 차트 반응형 */
  .recharts-wrapper {
    width: 100% !important;
    height: 300px !important;
  }
}

/* 초소형 화면 최적화 (480px 이하) */
@media (max-width: 480px) {
  .app-title {
    font-size: 20px;
  }

  .app-subtitle {
    font-size: 12px;
  }

  .main-tabs .ant-tabs-tab {
    padding: 6px 8px;
    font-size: 12px;
  }

  .ant-card-head-title {
    font-size: 16px;
  }

  .ant-statistic-title {
    font-size: 12px;
  }

  .ant-statistic-content {
    font-size: 20px;
  }

  .ant-btn-lg {
    height: 40px;
    font-size: 14px;
  }

  /* 테이블 매우 작게 */
  .ant-table {
    font-size: 11px;
  }

  .ant-table-thead > tr > th,
  .ant-table-tbody > tr > td {
    padding: 6px 2px;
  }

  /* Tag 크기 조정 */
  .ant-tag {
    font-size: 11px;
    padding: 2px 6px;
  }
}

/* 태블릿 최적화 (768px - 1024px) */
@media (min-width: 768px) and (max-width: 1024px) {
  .app-container {
    max-width: 100%;
    padding: 0 16px;
  }

  .today-overview .ant-col {
    width: 33.33% !important;
  }

  .ant-table {
    font-size: 13px;
  }
}

/* 가로 모드 최적화 */
@media (orientation: landscape) and (max-width: 896px) {
  .app-header {
    padding: 12px;
  }

  .app-title {
    font-size: 20px;
  }

  .main-tabs {
    max-height: calc(100vh - 200px);
    overflow-y: auto;
  }
}

/* PWA 노치 대응 (iPhone X 이상) */
@supports (padding: max(0px)) {
  .app-content {
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }
}

/* 다크 모드 지원 */
@media (prefers-color-scheme: dark) {
  .dongpa-app {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  }

  .app-footer {
    color: #ccc;
  }
}

/* 애니메이션 */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ant-card {
  animation: fadeIn 0.3s ease-out;
}

/* 로딩 상태 */
.ant-spin-container {
  min-height: 200px;
}

/* 버튼 호버 효과 */
.ant-btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.4);
  transition: all 0.3s ease;
}

/* 스크롤바 스타일링 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 10px;
}

::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 10px;
}

::-webkit-scrollbar-thumb:hover {
  background: #555;
}
```

### **1. UI 서브 컴포넌트**

#### **A. TodayOverview.jsx - 오늘 요일 & 분할 현황**
```jsx
import React from 'react';
import { Card, Tag, Space, Statistic, Row, Col } from 'antd';
import { CalendarOutlined, DashboardOutlined } from '@ant-design/icons';

export const TodayOverview = ({ divisionPortfolios, currentPrice }) => {
  const today = new Date();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[today.getDay()];
  const dateStr = today.toLocaleDateString('ko-KR');

  // 분할 사용 현황 계산
  const holdingDivisions = divisionPortfolios.filter(d => d.status === 'HOLDING').length;
  const emptyDivisions = 5 - holdingDivisions;

  // 총 자산 계산
  const totalCash = divisionPortfolios.reduce((sum, d) => sum + d.cash, 0);
  const totalValue = divisionPortfolios.reduce(
    (sum, d) => sum + (d.holdings * currentPrice),
    0
  );
  const totalAssets = totalCash + totalValue;

  return (
    <Card className="today-overview">
      <Row gutter={16}>
        <Col span={8}>
          <Space direction="vertical" size="small">
            <Space>
              <CalendarOutlined style={{ fontSize: 24, color: '#1890ff' }} />
              <div>
                <div style={{ fontSize: 24, fontWeight: 'bold' }}>
                  {weekday}요일
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {dateStr}
                </div>
              </div>
            </Space>
          </Space>
        </Col>

        <Col span={8}>
          <Statistic
            title="사용 중인 분할"
            value={holdingDivisions}
            suffix="/ 5"
            valueStyle={{ color: holdingDivisions > 3 ? '#ff4d4f' : '#3f8600' }}
            prefix={<DashboardOutlined />}
          />
        </Col>

        <Col span={8}>
          <Statistic
            title="비어있는 분할"
            value={emptyDivisions}
            suffix="개"
            valueStyle={{ color: emptyDivisions < 2 ? '#ff4d4f' : '#1890ff' }}
          />
        </Col>
      </Row>

      <div style={{ marginTop: 16 }}>
        <Space>
          <Tag color="blue">현금: ${totalCash.toFixed(2)}</Tag>
          <Tag color="green">평가액: ${totalValue.toFixed(2)}</Tag>
          <Tag color="gold">총 자산: ${totalAssets.toFixed(2)}</Tag>
        </Space>
      </div>
    </Card>
  );
};
```

#### **B. DivisionStatus.jsx - 5분할 상태 대시보드**
```jsx
import React from 'react';
import { Card, Table, Tag, Progress } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

export const DivisionStatus = ({ divisionPortfolios, currentPrice }) => {
  const columns = [
    {
      title: '분할',
      dataIndex: 'division',
      key: 'division',
      render: (text) => <strong>분할 {text}</strong>,
      width: 80
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag
          color={status === 'HOLDING' ? 'green' : 'default'}
          icon={status === 'HOLDING' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
        >
          {status === 'HOLDING' ? '보유중' : '비어있음'}
        </Tag>
      ),
      width: 120
    },
    {
      title: '보유량',
      dataIndex: 'holdings',
      key: 'holdings',
      render: (holdings) => holdings > 0 ? `${holdings}주` : '-',
      width: 100
    },
    {
      title: '평단가',
      dataIndex: 'avgPrice',
      key: 'avgPrice',
      render: (price) => price > 0 ? `$${price.toFixed(2)}` : '-',
      width: 100
    },
    {
      title: '매수일',
      dataIndex: 'buyDate',
      key: 'buyDate',
      render: (date) => date ? new Date(date).toLocaleDateString('ko-KR') : '-',
      width: 120
    },
    {
      title: '보유일수',
      dataIndex: 'holdingDays',
      key: 'holdingDays',
      render: (days, record) => {
        if (!record.buyDate) return '-';
        const holdingDays = Math.floor(
          (Date.now() - new Date(record.buyDate)) / (1000 * 60 * 60 * 24)
        );
        const maxDays = record.mode === 'safe' ? 30 : 7;
        const percentage = (holdingDays / maxDays) * 100;
        const color = percentage > 80 ? 'red' : percentage > 50 ? 'orange' : 'green';

        return (
          <div>
            <div>{holdingDays}일</div>
            <Progress
              percent={percentage}
              size="small"
              status={percentage > 80 ? 'exception' : 'active'}
              strokeColor={color}
              showInfo={false}
            />
          </div>
        );
      },
      width: 120
    },
    {
      title: '현재 수익률',
      key: 'profitRate',
      render: (_, record) => {
        if (record.holdings === 0) return '-';
        const profitRate = ((currentPrice - record.avgPrice) / record.avgPrice) * 100;
        return (
          <Tag color={profitRate >= 0 ? 'green' : 'red'}>
            {profitRate >= 0 ? '+' : ''}{profitRate.toFixed(2)}%
          </Tag>
        );
      },
      width: 120
    },
    {
      title: '평가손익',
      key: 'unrealizedPL',
      render: (_, record) => {
        if (record.holdings === 0) return '-';
        const pl = (currentPrice - record.avgPrice) * record.holdings;
        return (
          <span style={{ color: pl >= 0 ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
            ${pl.toFixed(2)}
          </span>
        );
      },
      width: 120
    }
  ];

  const dataSource = divisionPortfolios.map((div, index) => ({
    key: index,
    division: index + 1,
    ...div
  }));

  return (
    <Card title="📊 5분할 상태 대시보드" style={{ marginTop: 16 }}>
      <Table
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        size="middle"
        bordered
      />
    </Card>
  );
};
```

#### **C. TradeRecordForm.jsx - 매매 기록 입력 폼**
```jsx
import React, { useState } from 'react';
import { Card, Form, Select, InputNumber, DatePicker, Input, Button, message, Space } from 'antd';
import { PlusOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;

export const TradeRecordForm = ({ onSave }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const record = {
        id: Date.now(),
        date: values.date.format('YYYY-MM-DD'),
        division: values.division,
        action: values.action,
        quantity: values.quantity,
        price: values.price,
        amount: values.quantity * values.price,
        comment: values.comment || '',
        createdAt: new Date().toISOString()
      };

      // localStorage에 저장
      const existingRecords = JSON.parse(localStorage.getItem('tradeRecords') || '[]');
      existingRecords.push(record);
      localStorage.setItem('tradeRecords', JSON.stringify(existingRecords));

      message.success('매매 기록이 저장되었습니다!');
      form.resetFields();
      onSave && onSave(record);
    } catch (error) {
      message.error('저장 실패: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title="📝 매매 기록 입력"
      style={{ marginTop: 16 }}
      extra={<PlusOutlined />}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          date: dayjs(),
          action: 'BUY'
        }}
      >
        <Space direction="horizontal" size="middle" style={{ width: '100%' }}>
          <Form.Item
            label="날짜"
            name="date"
            rules={[{ required: true, message: '날짜를 선택하세요' }]}
            style={{ width: 150 }}
          >
            <DatePicker
              format="YYYY-MM-DD"
              placeholder="날짜 선택"
            />
          </Form.Item>

          <Form.Item
            label="분할"
            name="division"
            rules={[{ required: true, message: '분할을 선택하세요' }]}
            style={{ width: 100 }}
          >
            <Select placeholder="분할">
              <Option value={1}>분할 1</Option>
              <Option value={2}>분할 2</Option>
              <Option value={3}>분할 3</Option>
              <Option value={4}>분할 4</Option>
              <Option value={5}>분할 5</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="매매"
            name="action"
            rules={[{ required: true }]}
            style={{ width: 100 }}
          >
            <Select>
              <Option value="BUY">매수</Option>
              <Option value="SELL">매도</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="주식수"
            name="quantity"
            rules={[{ required: true, message: '주식수를 입력하세요' }]}
            style={{ width: 120 }}
          >
            <InputNumber
              min={1}
              placeholder="주"
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            label="가격"
            name="price"
            rules={[{ required: true, message: '가격을 입력하세요' }]}
            style={{ width: 120 }}
          >
            <InputNumber
              min={0}
              step={0.01}
              prefix="$"
              placeholder="0.00"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Space>

        <Form.Item
          label="코멘트"
          name="comment"
          style={{ marginTop: 8 }}
        >
          <TextArea
            rows={2}
            placeholder="매매 이유나 메모를 입력하세요 (선택)"
            maxLength={200}
            showCount
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            icon={<SaveOutlined />}
            block
          >
            기록 저장
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};
```

#### **D. TradeRecordList.jsx - 매매 기록 목록**
```jsx
import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Popconfirm, message, Space } from 'antd';
import { DeleteOutlined, CommentOutlined } from '@ant-design/icons';

export const TradeRecordList = () => {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = () => {
    const data = JSON.parse(localStorage.getItem('tradeRecords') || '[]');
    setRecords(data.sort((a, b) => new Date(b.date) - new Date(a.date)));
  };

  const handleDelete = (id) => {
    const updated = records.filter(r => r.id !== id);
    localStorage.setItem('tradeRecords', JSON.stringify(updated));
    setRecords(updated);
    message.success('기록이 삭제되었습니다');
  };

  const columns = [
    {
      title: '날짜',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      render: (date) => {
        const d = new Date(date);
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        return (
          <div>
            <div>{date}</div>
            <Tag color="blue">{weekdays[d.getDay()]}요일</Tag>
          </div>
        );
      }
    },
    {
      title: '분할',
      dataIndex: 'division',
      key: 'division',
      width: 80,
      render: (div) => <Tag color="purple">분할{div}</Tag>
    },
    {
      title: '매매',
      dataIndex: 'action',
      key: 'action',
      width: 80,
      render: (action) => (
        <Tag color={action === 'BUY' ? 'green' : 'red'}>
          {action === 'BUY' ? '매수' : '매도'}
        </Tag>
      )
    },
    {
      title: '주식수',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      render: (qty) => `${qty}주`
    },
    {
      title: '가격',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (price) => `$${price.toFixed(2)}`
    },
    {
      title: '금액',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (amount) => <strong>${amount.toFixed(2)}</strong>
    },
    {
      title: '코멘트',
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
      render: (comment) => comment ? (
        <Space>
          <CommentOutlined />
          <span>{comment}</span>
        </Space>
      ) : '-'
    },
    {
      title: '작업',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title="정말 삭제하시겠습니까?"
          onConfirm={() => handleDelete(record.id)}
          okText="삭제"
          cancelText="취소"
        >
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
          />
        </Popconfirm>
      )
    }
  ];

  return (
    <Card
      title="📜 매매 기록 내역"
      style={{ marginTop: 16 }}
      extra={<span style={{ color: '#888' }}>총 {records.length}건</span>}
    >
      <Table
        dataSource={records}
        columns={columns}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `총 ${total}건`
        }}
        size="middle"
        bordered
      />
    </Card>
  );
};
```

### **1. 동파법 계산 엔진 (dongpaEngine.js) - 분할별 독립 운영**
```javascript
export class DongpaEngine {
  constructor(config) {
    this.config = {
      initialCapital: config.initialCapital || 10000,
      divisions: 5, // 5분할 고정
      mode: config.mode || 'safe',
      fees: {
        commission: 0.00044,  // 0.044%
        secFee: 0.0000278     // 0.00278%
      },
      modes: {
        safe: {
          sellTarget: 0.002,   // 0.2% 수익
          buyTarget: 0.03,     // 3.0% 하락
          holdingDays: 30      // 최대 30일 보유
        },
        aggressive: {
          sellTarget: 0.025,   // 2.5% 수익
          buyTarget: 0.05,     // 5.0% 하락
          holdingDays: 7       // 최대 7일 보유
        }
      }
    };
  }

  calculateSignals(priceData) {
    const { initialCapital, divisions, mode, fees } = this.config;
    const modeConfig = this.config.modes[mode];
    const baseAmount = initialCapital / divisions;

    // 분할별 독립 포트폴리오 초기화
    const divisionPortfolios = Array.from({ length: divisions }, () => ({
      cash: baseAmount,
      holdings: 0,
      avgPrice: 0,
      buyDate: null,
      status: 'EMPTY', // EMPTY or HOLDING
      maxDrawdown: 0
    }));

    const trades = [];
    let peakValue = initialCapital;
    let maxDrawdown = 0;

    priceData.forEach((day, index) => {
      // 전일 종가 대비 변동률 계산
      let changeRate = 0;
      if (index > 0) {
        const prevClose = priceData[index - 1].price;
        changeRate = (day.price - prevClose) / prevClose;
      }

      const dailyActions = [];
      let totalBuyQty = 0;
      let totalSellQty = 0;
      let totalBuyAmount = 0;
      let totalSellAmount = 0;
      let dailyProfit = 0;

      // 각 분할별로 매수/매도 조건 체크
      divisionPortfolios.forEach((division, divIndex) => {
        // 매수 조건 체크 (비어있는 분할만)
        if (division.status === 'EMPTY' &&
            changeRate <= -modeConfig.buyTarget &&
            division.cash >= baseAmount * 0.9) {  // 수수료 고려

          const quantity = Math.floor(division.cash / day.price);
          const amount = quantity * day.price;
          const commission = amount * (fees.commission + fees.secFee);

          if (division.cash >= amount + commission) {
            // 매수 실행
            division.holdings = quantity;
            division.avgPrice = day.price;
            division.buyDate = day.date;
            division.cash = 0;
            division.status = 'HOLDING';

            totalBuyQty += quantity;
            totalBuyAmount += amount + commission;

            dailyActions.push({
              division: divIndex + 1,
              action: 'BUY',
              quantity,
              price: day.price,
              amount,
              commission
            });
          }
        }

        // 매도 조건 체크 (보유 중인 분할만)
        if (division.status === 'HOLDING') {
          const profitRate = (day.price - division.avgPrice) / division.avgPrice;
          const holdingDays = Math.floor(
            (new Date(day.date) - new Date(division.buyDate)) / (1000 * 60 * 60 * 24)
          );

          const shouldSell =
            profitRate >= modeConfig.sellTarget ||
            holdingDays >= modeConfig.holdingDays;

          if (shouldSell) {
            // 매도 실행
            const quantity = division.holdings;
            const amount = quantity * day.price;
            const commission = amount * (fees.commission + fees.secFee);
            const profit = amount - (quantity * division.avgPrice) - commission;
            const sellReason = profitRate >= modeConfig.sellTarget ? '수익' : '손절';

            division.cash = amount - commission;
            division.holdings = 0;
            division.avgPrice = 0;
            division.buyDate = null;
            division.status = 'EMPTY';

            totalSellQty += quantity;
            totalSellAmount += amount;
            dailyProfit += profit;

            dailyActions.push({
              division: divIndex + 1,
              action: 'SELL',
              quantity,
              price: day.price,
              amount,
              commission,
              profit,
              profitRate: profitRate * 100,
              holdingDays,
              reason: sellReason
            });
          }
        }
      });

      // 전체 포트폴리오 가치 계산
      const totalCash = divisionPortfolios.reduce((sum, div) => sum + div.cash, 0);
      const totalHoldings = divisionPortfolios.reduce((sum, div) => sum + div.holdings, 0);
      const currentValue = divisionPortfolios.reduce(
        (sum, div) => sum + (div.holdings * day.price),
        0
      );
      const totalAssets = totalCash + currentValue;

      // MDD 계산
      if (totalAssets > peakValue) {
        peakValue = totalAssets;
      }
      const drawdown = (peakValue - totalAssets) / peakValue;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      const returnRate = ((totalAssets - initialCapital) / initialCapital) * 100;

      // 순매매량 계산
      const netQuantity = totalBuyQty - totalSellQty;
      const netAction = netQuantity > 0 ? 'NET_BUY' :
                       netQuantity < 0 ? 'NET_SELL' : 'HOLD';

      trades.push({
        key: index,
        date: day.date,
        price: day.price,
        change: changeRate * 100,
        action: dailyActions.length > 0 ? netAction : 'HOLD',
        dailyActions,  // 분할별 상세 액션
        totalBuyQty,
        totalSellQty,
        netQuantity: Math.abs(netQuantity),
        netAction,
        totalCash,
        totalHoldings,
        currentValue,
        totalAssets,
        returnRate,
        dailyProfit,
        drawdown: -drawdown * 100,
        divisionStatus: divisionPortfolios.map((div, idx) => ({
          division: idx + 1,
          status: div.status,
          holdings: div.holdings,
          avgPrice: div.avgPrice,
          cash: div.cash,
          holdingDays: div.buyDate
            ? Math.floor((new Date(day.date) - new Date(div.buyDate)) / (1000 * 60 * 60 * 24))
            : 0,
          profitRate: div.holdings > 0
            ? ((day.price - div.avgPrice) / div.avgPrice) * 100
            : 0
        }))
      });
    });

    return {
      trades,
      divisionPortfolios,
      finalValue: divisionPortfolios.reduce(
        (sum, div) => sum + div.cash + (div.holdings * priceData[priceData.length - 1].price),
        0
      ),
      maxDrawdown
    };
  }

  generateSummary(trades) {
    // 분할별 액션 집계
    const allActions = trades.flatMap(t => t.dailyActions || []);
    const buyActions = allActions.filter(a => a.action === 'BUY');
    const sellActions = allActions.filter(a => a.action === 'SELL');
    const profitableSells = sellActions.filter(a => a.profit > 0);

    return {
      totalTrades: allActions.length,
      buyTrades: buyActions.length,
      sellTrades: sellActions.length,
      winRate: sellActions.length > 0
        ? (profitableSells.length / sellActions.length * 100)
        : 0,
      avgWin: profitableSells.length > 0
        ? profitableSells.reduce((sum, a) => sum + a.profit, 0) / profitableSells.length
        : 0,
      avgLoss: (sellActions.length - profitableSells.length) > 0
        ? sellActions.filter(a => a.profit < 0).reduce((sum, a) => sum + a.profit, 0) /
          (sellActions.length - profitableSells.length)
        : 0,
      totalCommission: allActions.reduce((sum, a) => sum + (a.commission || 0), 0),
      totalProfit: sellActions.reduce((sum, a) => sum + (a.profit || 0), 0),
      finalReturn: trades.length > 0 ? trades[trades.length - 1].returnRate : 0,

      // 분할별 통계
      divisionStats: this.calculateDivisionStats(trades)
    };
  }

  calculateDivisionStats(trades) {
    const divisionData = {};

    trades.forEach(trade => {
      if (trade.dailyActions) {
        trade.dailyActions.forEach(action => {
          const divKey = `division${action.division}`;
          if (!divisionData[divKey]) {
            divisionData[divKey] = {
              division: action.division,
              trades: 0,
              wins: 0,
              losses: 0,
              totalProfit: 0
            };
          }

          if (action.action === 'SELL') {
            divisionData[divKey].trades++;
            if (action.profit > 0) {
              divisionData[divKey].wins++;
              divisionData[divKey].totalProfit += action.profit;
            } else {
              divisionData[divKey].losses++;
              divisionData[divKey].totalProfit += action.profit;
            }
          }
        });
      }
    });

    return Object.values(divisionData).map(div => ({
      ...div,
      winRate: div.trades > 0 ? (div.wins / div.trades * 100) : 0
    }));
  }
}
```

### **2. 실시간 데이터 API (marketApi.js)**
```javascript
const API_KEY = process.env.REACT_APP_ALPHA_VANTAGE_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';

export class MarketDataAPI {
  static async fetchSOXLRealtime() {
    try {
      const response = await fetch(
        `${BASE_URL}?function=GLOBAL_QUOTE&symbol=SOXL&apikey=${API_KEY}`
      );
      const data = await response.json();
      
      if (data['Error Message']) {
        throw new Error('API 호출 한도 초과');
      }
      
      const quote = data['Global Quote'];
      return {
        price: parseFloat(quote['05. price']),
        change: parseFloat(quote['09. change']),
        changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
        volume: parseInt(quote['06. volume']),
        timestamp: new Date(quote['07. latest trading day'])
      };
    } catch (error) {
      console.error('실시간 데이터 로딩 실패:', error);
      return this.getMockData();
    }
  }

  static async fetchSOXLHistorical(days = 90) {
    try {
      const response = await fetch(
        `${BASE_URL}?function=TIME_SERIES_DAILY&symbol=SOXL&outputsize=compact&apikey=${API_KEY}`
      );
      const data = await response.json();

      if (data['Error Message']) {
        throw new Error('API 호출 한도 초과');
      }

      const timeSeries = data['Time Series (Daily)'];
      const historicalData = [];

      // 종가(Close) 기준으로 데이터 추출
      Object.keys(timeSeries)
        .sort((a, b) => new Date(a) - new Date(b))
        .slice(-days)
        .forEach((date, index, array) => {
          const dayData = timeSeries[date];

          // 종가 (Close Price) 사용
          const closePrice = parseFloat(dayData['4. close']);

          // 전일 종가와 비교하여 변동률 계산
          let change = 0;
          if (index > 0) {
            const prevDate = array[index - 1];
            const prevClose = parseFloat(timeSeries[prevDate]['4. close']);
            change = ((closePrice - prevClose) / prevClose) * 100;
          }

          historicalData.push({
            date,
            price: closePrice,  // 종가 사용
            change: isNaN(change) ? 0 : change,
            volume: parseInt(dayData['5. volume']),
            high: parseFloat(dayData['2. high']),
            low: parseFloat(dayData['3. low']),
            open: parseFloat(dayData['1. open'])
          });
        });

      return historicalData;
    } catch (error) {
      console.error('과거 데이터 로딩 실패:', error);
      return this.getMockHistoricalData(days);
    }
  }

  static getMockData() {
    // API 한도 초과시 목업 데이터 반환
    return {
      price: 28.45 + (Math.random() - 0.5) * 2,
      change: (Math.random() - 0.5) * 6,
      changePercent: (Math.random() - 0.5) * 6,
      volume: 45000000 + Math.floor(Math.random() * 20000000),
      timestamp: new Date()
    };
  }

  static getMockHistoricalData(days) {
    const data = [];
    let closePrice = 25.0;  // 종가
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      // 주말 제외
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      // 전일 종가
      const prevClose = closePrice;

      // SOXL의 높은 변동성 반영 (-15% ~ +15%)
      const changePercent = (Math.random() - 0.5) * 15;
      closePrice = Math.max(15, prevClose * (1 + changePercent / 100));

      // 일중 가격 변동 (시가, 고가, 저가)
      const open = prevClose * (1 + (Math.random() - 0.5) * 0.03);
      const high = Math.max(open, closePrice) * (1 + Math.random() * 0.05);
      const low = Math.min(open, closePrice) * (1 - Math.random() * 0.05);

      data.push({
        date: date.toISOString().split('T')[0],
        price: Number(closePrice.toFixed(2)),  // 종가
        change: changePercent,  // 전일 종가 대비 변동률
        volume: Math.floor(Math.random() * 50000000) + 20000000,
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        open: Number(open.toFixed(2))
      });
    }

    return data;
  }
}
```

### **3. PWA 알림 시스템 (notifications.js)**
```javascript
export class NotificationManager {
  static async requestPermission() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  static async sendTradingSignal(type, data) {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) return;

    const messages = {
      BUY: {
        title: '🚀 동파법 매수 신호!',
        body: `SOXL ${data.quantity}주 @$${data.price.toFixed(2)} 매수 추천`,
        icon: '/icon-192x192.png',
        tag: 'trading-buy'
      },
      SELL: {
        title: '💰 동파법 매도 신호!',
        body: `SOXL ${data.quantity}주 @$${data.price.toFixed(2)} 매도 (수익: $${data.profit?.toFixed(2) || '0.00'})`,
        icon: '/icon-192x192.png',
        tag: 'trading-sell'
      }
    };

    const config = messages[type];
    if (config) {
      new Notification(config.title, {
        body: config.body,
        icon: config.icon,
        tag: config.tag,
        requireInteraction: true
      });

      // 소리 재생 (옵션)
      this.playNotificationSound();
    }
  }

  static playNotificationSound() {
    const audio = new Audio('/notification.mp3');
    audio.play().catch(console.error);
  }

  static async scheduleCheck() {
    // Service Worker에서 백그라운드 체크
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.sync.register('check-trading-signals');
      });
    }
  }
}
```

### **4. React 메인 컴포넌트 훅 (useDongpaCalculator.js)**
```javascript
import { useState, useEffect, useMemo, useCallback } from 'react';
import { DongpaEngine } from '../services/dongpaEngine';
import { MarketDataAPI } from '../services/marketApi';
import { NotificationManager } from '../services/notifications';

export const useDongpaCalculator = (initialConfig) => {
  const [config, setConfig] = useState({
    initialCapital: 10000,
    divisions: 5,  // 5분할 고정
    mode: 'safe',
    ...initialConfig
  });
  
  const [realtimeData, setRealtimeData] = useState([]);
  const [historicalData, setHistoricalData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [prevSignal, setPrevSignal] = useState(null);

  // 동파법 엔진 초기화
  const engine = useMemo(() => new DongpaEngine(config), [config]);

  // 실시간 데이터 업데이트
  const updateRealtimeData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await MarketDataAPI.fetchSOXLRealtime();
      setCurrentPrice(data.price);
      
      // 최근 5일 데이터 시뮬레이션
      const mockRecentData = [
        { date: '2024-12-09', price: 25.25, change: -3.2 },
        { date: '2024-12-10', price: 24.91, change: -1.3 },
        { date: '2024-12-11', price: 25.65, change: 3.0 },
        { date: '2024-12-12', price: 26.45, change: 3.1 },
        { date: '2024-12-13', price: data.price, change: data.changePercent }
      ];
      
      setRealtimeData(mockRecentData);
      setLastUpdate(new Date());
      
      // 매매 신호 체크 및 알림
      const signals = engine.calculateSignals(mockRecentData);
      const latestTrade = signals.trades[signals.trades.length - 1];
      
      if (latestTrade.action !== 'HOLD' && latestTrade.action !== prevSignal) {
        await NotificationManager.sendTradingSignal(latestTrade.action, {
          quantity: latestTrade.quantity,
          price: latestTrade.price,
          profit: latestTrade.profit
        });
        setPrevSignal(latestTrade.action);
      }
      
    } catch (error) {
      console.error('데이터 업데이트 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [engine, prevSignal]);

  // 백테스팅 데이터 로드
  const loadHistoricalData = useCallback(async (days = 90) => {
    setLoading(true);
    try {
      const data = await MarketDataAPI.fetchSOXLHistorical(days);
      setHistoricalData(data);
    } catch (error) {
      console.error('백테스팅 데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 실시간 및 백테스팅 결과 계산
  const liveResults = useMemo(() => {
    if (!realtimeData.length) return { trades: [], portfolio: null, summary: null };
    return {
      ...engine.calculateSignals(realtimeData),
      summary: engine.generateSummary(engine.calculateSignals(realtimeData).trades)
    };
  }, [engine, realtimeData]);

  const backtestResults = useMemo(() => {
    if (!historicalData.length) return { trades: [], portfolio: null, summary: null };
    return {
      ...engine.calculateSignals(historicalData),
      summary: engine.generateSummary(engine.calculateSignals(historicalData).trades)
    };
  }, [engine, historicalData]);

  // 자동 업데이트 설정
  useEffect(() => {
    updateRealtimeData();
    loadHistoricalData();
    
    const interval = setInterval(updateRealtimeData, 30000); // 30초마다
    return () => clearInterval(interval);
  }, [updateRealtimeData, loadHistoricalData]);

  // 설정 업데이트 함수들
  const updateConfig = useCallback((newConfig) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  const setInitialCapital = useCallback((capital) => {
    updateConfig({ initialCapital: capital });
  }, [updateConfig]);

  const setTradingMode = useCallback((mode) => {
    updateConfig({ mode });
  }, [updateConfig]);

  return {
    // 상태
    config,
    currentPrice,
    loading,
    lastUpdate,

    // 결과
    liveResults,
    backtestResults,

    // 액션
    updateRealtimeData,
    loadHistoricalData,
    setInitialCapital,
    setTradingMode,
    updateConfig
  };
};
```

---

## 📱 PWA 설정

### **1. manifest.json**
```json
{
  "name": "동파법 SOXL 자동매매",
  "short_name": "동파법",
  "description": "실시간 SOXL 동파법 매매 신호 및 백테스팅",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "theme_color": "#1890ff",
  "background_color": "#ffffff",
  "categories": ["finance", "productivity"],
  "lang": "ko",
  "icons": [
    {
      "src": "/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icon-192x192.png",
      "sizes": "192x192", 
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable any"
    }
  ],
  "shortcuts": [
    {
      "name": "실시간 매매",
      "short_name": "매매",
      "description": "실시간 SOXL 매매 신호 확인",
      "url": "/?tab=live",
      "icons": [{ "src": "/icon-192x192.png", "sizes": "192x192" }]
    },
    {
      "name": "백테스팅",
      "short_name": "백테스트",
      "description": "과거 성과 분석",
      "url": "/?tab=backtest", 
      "icons": [{ "src": "/icon-192x192.png", "sizes": "192x192" }]
    }
  ]
}
```

### **2. Service Worker (sw.js)**
```javascript
const CACHE_NAME = 'dongpa-soxl-v1.0.0';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// 설치
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// 캐시에서 응답
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 캐시에 있으면 반환, 없으면 네트워크 요청
        return response || fetch(event.request);
      }
    )
  );
});

// 백그라운드 동기화 - 매매 신호 체크
self.addEventListener('sync', event => {
  if (event.tag === 'check-trading-signals') {
    event.waitUntil(checkTradingSignals());
  }
});

async function checkTradingSignals() {
  try {
    // API에서 최신 SOXL 가격 확인
    const response = await fetch('/api/soxl/current');
    const data = await response.json();
    
    // 매매 신호 계산 로직
    const shouldNotify = calculateTradingSignal(data);
    
    if (shouldNotify) {
      self.registration.showNotification('동파법 매매 신호', {
        body: `SOXL ${shouldNotify.action} 신호 발생!`,
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: 'trading-signal',
        requireInteraction: true,
        actions: [
          {
            action: 'view',
            title: '앱 열기',
            icon: '/icon-192x192.png'
          },
          {
            action: 'dismiss',
            title: '닫기'
          }
        ]
      });
    }
  } catch (error) {
    console.error('백그라운드 신호 체크 실패:', error);
  }
}

// 알림 클릭 처리
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
```

---

## 🚀 배포 가이드

### **1. Vercel 배포 (Frontend)**
```bash
# Vercel CLI 설치
npm i -g vercel

# 프로젝트 디렉토리에서
vercel login
vercel

# 환경 변수 설정
vercel env add REACT_APP_ALPHA_VANTAGE_KEY
vercel env add REACT_APP_API_URL

# 프로덕션 배포
vercel --prod
```

### **2. Railway 배포 (Backend)**
```bash
# Railway CLI 설치
npm install -g