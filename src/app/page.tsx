'use client'

import React, { useMemo, useState } from 'react';
import { Layout, Tabs, Typography, Space, Button, Alert, Card } from 'antd';
import {
  SettingOutlined,
  RocketOutlined,
  FileTextOutlined,
  BarChartOutlined,
  LineChartOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { ConfigPanel } from '@/components/ConfigPanel';
import { TodayOverview } from '@/components/TodayOverview';
import { DivisionStatusPanel } from '@/components/DivisionStatusPanel';
import { TradeRecordForm } from '@/components/TradeRecordForm';
import { TradeRecordList } from '@/components/TradeRecordList';
import { CurrentInvestmentStatus } from '@/components/CurrentInvestmentStatus';
import { StrategySignalCard } from '@/components/StrategySignalCard';
import { DongpaOrderSheet } from '@/components/DongpaOrderSheet';
import { useMarketHistory } from '@/hooks/useMarketHistory';
import { useRSIMode } from '@/hooks/useRSIMode';
import { calculateDivisionStatesFromRecords, createInitialDivisionStates, DivisionState } from '@/utils/divisionStateCalculator';
import { TradeRecordService } from '@/services/supabaseService';
import { strategySignal } from '@/lib/strategy';
import { dongpaOrders } from '@/lib/dongpaOrders';
import { nextTradingDay } from '@/lib/marketTime';
import { DongpaConfig } from '@/types';
import { DEFAULT_CONFIG, TRADING, UI } from '@/constants';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

// 안전한 JSON 파싱
const safeJsonParse = <T,>(json: string | null, fallback: T): T => {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
};

// localStorage에서 설정 로드
const loadConfigFromStorage = (): DongpaConfig => {
  if (typeof window === 'undefined') {
    return DEFAULT_CONFIG;
  }

  const saved = localStorage.getItem('dongpaConfig');
  return safeJsonParse(saved, DEFAULT_CONFIG);
};

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('strategy');
  const [realDivisions, setRealDivisions] = useState<DivisionState[]>([]);
  const [userConfig, setUserConfig] = useState<DongpaConfig>(loadConfigFromStorage());
  const [tradeRecordRefresh, setTradeRecordRefresh] = useState(0);

  // DB 매매기록으로 분할 상태 계산
  const loadDivisionStates = React.useCallback(async (capital?: number) => {
    const targetCapital = capital || userConfig.initialCapital;

    try {
      const records = await TradeRecordService.getRecords();
      setRealDivisions(calculateDivisionStatesFromRecords(records, targetCapital, userConfig.divisions));
    } catch (error) {
      // DB 연결 실패 등 오류 시 초기 상태
      console.error('Failed to load division states:', error);
      setRealDivisions(createInitialDivisionStates(targetCapital, userConfig.divisions));
    }
  }, [userConfig.initialCapital, userConfig.divisions]);

  // 초기 로드
  React.useEffect(() => {
    const config = loadConfigFromStorage();
    setUserConfig(config);
    loadDivisionStates(config.initialCapital);
  }, [loadDivisionStates]);

  const handleConfigChange = (newConfig: Partial<DongpaConfig>) => {
    const updated = { ...userConfig, ...newConfig };
    setUserConfig(updated);
    localStorage.setItem('dongpaConfig', JSON.stringify(updated));

    // 초기자금 변경 시 분할 상태 재계산
    if (newConfig.initialCapital) {
      loadDivisionStates(newConfig.initialCapital);
    }
  };

  // 추천 전략: ^NDX 300일 이동평균까지 필요. 동파법: 주간 RSI 수렴을 위해 4년치
  const ndx = useMarketHistory('^NDX', 400);
  const qld = useMarketHistory('QLD', 5);
  const soxl = useMarketHistory('SOXL', 1000);
  const signal = useMemo(() => strategySignal(ndx.data), [ndx.data]);
  const historicalData = soxl.data;

  // RSI 모드 계산 (auto 모드일 때만)
  const rsiModeInfo = useRSIMode({
    marketData: historicalData,
    enabled: userConfig.mode === 'auto'
  });

  // 마지막 확정 종가와 그 전일 종가
  const last = historicalData[historicalData.length - 1];
  const prev = historicalData[historicalData.length - 2];
  const todayClose = last?.price ?? 0;
  const todayDate = last?.date ?? '';
  const yesterdayClose = prev?.price ?? todayClose;
  const yesterdayDate = prev?.date ?? '';

  // 다음 정규장에 적용할 모드와 주문표
  const effectiveMode = userConfig.mode === 'auto' ? rsiModeInfo.mode : userConfig.mode;
  const session = todayDate ? nextTradingDay(todayDate) : '';
  const orders = useMemo(
    () => (todayClose > 0 ? dongpaOrders(realDivisions as DivisionState[], todayClose, effectiveMode, session) : []),
    [realDivisions, todayClose, effectiveMode, session]
  );

  const tabItems = [
    {
      key: 'strategy',
      label: (
        <Space>
          <LineChartOutlined />
          추천 전략
        </Space>
      ),
      children: (
        <StrategySignalCard
          signal={signal}
          tradePrice={qld.data[qld.data.length - 1]?.price ?? null}
          loading={ndx.loading}
          error={ndx.error ?? qld.error}
        />
      )
    },
    {
      key: 'dongpa',
      label: (
        <Space>
          <RocketOutlined />
          동파법
        </Space>
      ),
      children: soxl.error ? (
        <Alert type="error" showIcon message="SOXL 시세를 불러오지 못했습니다" description={soxl.error} />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <TodayOverview
            divisionPortfolios={realDivisions}
            yesterdayClose={yesterdayClose}
            yesterdayDate={yesterdayDate}
            todayClose={todayClose}
            todayDate={todayDate}
            initialCapital={userConfig.initialCapital}
            mode={userConfig.mode}
            rsiModeInfo={rsiModeInfo}
          />

          {session && <DongpaOrderSheet orders={orders} session={session} mode={effectiveMode} />}

          <DivisionStatusPanel
            divisionPortfolios={realDivisions}
            todayClose={todayClose}
            mode={userConfig.mode}
          />
        </Space>
      )
    },
    {
      key: 'records',
      label: (
        <Space>
          <FileTextOutlined />
          매매 기록
        </Space>
      ),
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 현재 투자 상태 */}
          <CurrentInvestmentStatus
            divisions={realDivisions}
            currentPrice={todayClose}
            initialCapital={userConfig.initialCapital}
          />

          {/* 매매 기록 입력 폼 */}
          <TradeRecordForm divisions={userConfig.divisions} onSave={() => {
            loadDivisionStates();
            setTradeRecordRefresh(prev => prev + 1);
          }} />

          {/* 매매 기록 목록 */}
          <TradeRecordList refreshTrigger={tradeRecordRefresh} />
        </Space>
      )
    },
    {
      key: 'settings',
      label: (
        <Space>
          <SettingOutlined />
          설정
        </Space>
      ),
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <ConfigPanel
            config={userConfig}
            onConfigChange={handleConfigChange}
            divisionAmount={userConfig.initialCapital / userConfig.divisions}
          />

          {/* 거래 가이드 */}
          <Card title="📖 동파법 거래 가이드">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Alert
                message="안전모드 — RSI 하락 중 / 50선 하향 / 과매수(>65)"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    <li>매수 조건: 전일 대비 -{Math.abs(TRADING.SAFE.BUY_TARGET * 100).toFixed(0)}% 이상 하락 시</li>
                    <li>매도 조건: +{(TRADING.SAFE.SELL_TARGET * 100).toFixed(0)}% 수익 달성 또는 최대 {TRADING.SAFE.HOLDING_DAYS}거래일 경과 시</li>
                    <li>하락장 방어 집중 — 작은 수익 빠르게 실현</li>
                  </ul>
                }
                type="success"
                showIcon
              />

              <Alert
                message="공세모드 — RSI 상승 중 / 50선 상향 돌파"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    <li>매수 조건: 전일 대비 -{Math.abs(TRADING.AGGRESSIVE.BUY_TARGET * 100).toFixed(0)}% 이상 하락 시 (더 큰 조정 대기)</li>
                    <li>매도 조건: +{(TRADING.AGGRESSIVE.SELL_TARGET * 100).toFixed(0)}% 수익 달성 또는 최대 {TRADING.AGGRESSIVE.HOLDING_DAYS}거래일 경과 시</li>
                    <li>상승 추세 활용 — 짧게 보유, 큰 수익 추구</li>
                  </ul>
                }
                type="warning"
                showIcon
              />

              <Alert
                message="강세모드 — 주간 RSI 55~65 구간에서 상승 중"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    <li>매수 조건: 전일 대비 -{Math.abs(TRADING.BULL.BUY_TARGET * 100).toFixed(0)}% 이상 하락 시</li>
                    <li>매도 조건: +{(TRADING.BULL.SELL_TARGET * 100).toFixed(0)}% 수익 달성 또는 최대 {TRADING.BULL.HOLDING_DAYS}거래일 경과 시</li>
                    <li>강세 추세 추종 — 장기 보유로 큰 수익 극대화</li>
                  </ul>
                }
                type="info"
                showIcon
              />

              <Alert
                message="현금보유 모드 — 주간 RSI < 40 하락 중"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    <li>신규 매수 전면 중단</li>
                    <li>보유 중인 분할은 매도 조건 도달 시 정상 청산</li>
                    <li>하락장 진입 감지 — 현금 비중 확대로 자산 보호</li>
                  </ul>
                }
                type="error"
                showIcon
              />

              <Alert
                message="💡 핵심 원칙"
                description={
                  <div>
                    <p><strong>1. 분할별 독립 운영:</strong> 각 분할은 개별 포트폴리오로 관리 ({DEFAULT_CONFIG.divisions}분할)</p>
                    <p><strong>2. 종가 기준:</strong> 모든 매매 판단은 당일 종가 기준</p>
                    <p><strong>3. LOC 주문:</strong> 장 마감 전 지정가(LOC)로 종가 체결</p>
                    <p><strong>4. 자동 손절:</strong> 최대 보유기간 도달 시 강제 매도</p>
                    <p style={{ marginBottom: 0 }}><strong>5. RSI 자동모드 권장:</strong> 시장 국면에 따라 4가지 모드 자동 전환</p>
                  </div>
                }
                type="info"
                showIcon
              />
            </Space>
          </Card>
        </Space>
      )
    }
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: UI.COLORS.BACKGROUND }}>
      <Header style={{ 
        background: '#fff', 
        padding: '0 16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        borderBottom: '1px solid #e8e8e8',
        height: 'auto',
        minHeight: '64px'
      }}>
        <div className="flex justify-between items-center py-2 gap-4">
          {/* 좌측: 타이틀 */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Title
              level={3}
              className="!m-0 text-primary-500 text-base sm:text-lg lg:text-xl truncate"
            >
              🚀 동파
            </Title>
            <Text
              type="secondary"
              className="hidden sm:inline text-xs sm:text-sm"
            >
              매매 신호 & 백테스팅
            </Text>
          </div>

          {/* 중앙: 백테스팅 버튼 */}
          <Button
            type="primary"
            icon={<BarChartOutlined />}
            onClick={() => router.push('/backtest')}
            size="large"
            style={{
              background: UI.COLORS.PRIMARY_GRADIENT,
              border: 'none'
            }}
          >
            백테스팅
          </Button>


        </div>
      </Header>

      <Content style={{ padding: '24px' }}>
        <div style={{ minHeight: UI.MIN_HEIGHT }}>
          {/* 메인 탭 컨텐츠 */}
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            tabBarGutter={20}
            tabBarStyle={{ marginBottom: 16 }}
          />
        </div>

        {/* 면책조항 */}
        <Alert
          message="투자 유의사항"
          description={
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                본 시스템은 교육 및 분석 목적으로 제작되었습니다. 
                실제 투자 결정은 개인의 책임이며, 투자에 따른 손실에 대해 개발자는 책임지지 않습니다. 
                QLD(2배)·SOXL(3배) 같은 레버리지 ETF는 변동성이 커서 큰 손실이 날 수 있습니다.
              </Text>
            </div>
          }
          type="warning"
          style={{ marginTop: 24 }}
        />
      </Content>
    </Layout>
  );
}
