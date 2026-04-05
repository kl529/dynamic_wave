'use client'

import React, { useState } from 'react';
import { Layout, Tabs, Typography, Space, Button, Alert, Spin, Card, Row, Col } from 'antd';
import {
  SettingOutlined,
  TableOutlined,
  RocketOutlined,
  FileTextOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { ConfigPanel } from '@/components/ConfigPanel';
import { DongpaTradeTable } from '@/components/DongpaTradeTable';
import { TodayOverview } from '@/components/TodayOverview';
import { DivisionStatusPanel } from '@/components/DivisionStatusPanel';
import { TradeRecordForm } from '@/components/TradeRecordForm';
import { TradeRecordList } from '@/components/TradeRecordList';
import { CurrentInvestmentStatus } from '@/components/CurrentInvestmentStatus';
import { useDongpaEngine } from '@/hooks/useDongpaEngine';
import { useRSIMode } from '@/hooks/useRSIMode';
import { calculateDivisionStatesFromRecords, createInitialDivisionStates, DivisionState } from '@/utils/divisionStateCalculator';
import { TradeRecordService } from '@/services/supabaseService';
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
  const [activeTab, setActiveTab] = useState('today');
  const [realDivisions, setRealDivisions] = useState<DivisionState[]>([]);
  const [userConfig, setUserConfig] = useState<DongpaConfig>(loadConfigFromStorage());
  const [tradeRecordRefresh, setTradeRecordRefresh] = useState(0);
  const [divisionsLoading, setDivisionsLoading] = useState(true);

  // Supabase에서 매매기록을 로드하여 분할 상태 계산
  const loadDivisionStates = React.useCallback(async (capital?: number) => {
    const targetCapital = capital || userConfig.initialCapital;

    try {
      if (TradeRecordService.isConfigured()) {
        const records = await TradeRecordService.getRecords();
        const divisions = calculateDivisionStatesFromRecords(records, targetCapital);
        setRealDivisions(divisions);
      } else {
        // Supabase 미설정시 초기 상태
        setRealDivisions(createInitialDivisionStates(targetCapital));
      }
    } catch (error) {
      console.error('Failed to load division states:', error);
      setRealDivisions(createInitialDivisionStates(targetCapital));
    } finally {
      setDivisionsLoading(false);
    }
  }, [userConfig.initialCapital]);

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

  const {
    config,
    loading,
    tradeHistory,
    todaySignal,
    currentPrice,
    changePercent,
    historicalData,
    refreshCurrentPrice
  } = useDongpaEngine({ config: userConfig });

  // RSI 모드 계산 (auto 모드일 때만)
  const rsiModeInfo = useRSIMode({
    marketData: historicalData,
    enabled: userConfig.mode === 'auto'
  });

  // 오늘 종가와 어제 종가 계산 (최신 데이터가 오늘)
  const todayClose = historicalData.length > 0 
    ? historicalData[historicalData.length - 1].price 
    : currentPrice;
  const todayDate = historicalData.length > 0
    ? historicalData[historicalData.length - 1].date
    : '';
  const yesterdayClose = historicalData.length > 1 
    ? historicalData[historicalData.length - 2].price 
    : currentPrice;
  const yesterdayDate = historicalData.length > 1
    ? historicalData[historicalData.length - 2].date
    : '';

  // 실제 적용 모드 결정 (auto이면 RSI 기반)
  const effectiveMode = userConfig.mode === 'auto' && rsiModeInfo ? rsiModeInfo.mode : (userConfig.mode as 'safe' | 'aggressive' | 'bull' | 'cash');

  // 모드별 임계값 (v3.1 기준)
  const effectiveThresholds = {
    safe:       { buy: TRADING.SAFE.BUY_TARGET,       sell: TRADING.SAFE.SELL_TARGET,       holdDays: TRADING.SAFE.HOLDING_DAYS },
    aggressive: { buy: TRADING.AGGRESSIVE.BUY_TARGET, sell: TRADING.AGGRESSIVE.SELL_TARGET, holdDays: TRADING.AGGRESSIVE.HOLDING_DAYS },
    bull:       { buy: TRADING.BULL.BUY_TARGET,       sell: TRADING.BULL.SELL_TARGET,       holdDays: TRADING.BULL.HOLDING_DAYS },
    cash:       { buy: 0,                              sell: 0,                              holdDays: 0 },
  }[effectiveMode];

  // 다음 매수할 분할 찾기 (EMPTY 상태인 첫 번째 분할)
  const nextBuyDivision = realDivisions.find(d => d.status === 'EMPTY');
  const availableCash = nextBuyDivision?.cash || (userConfig.initialCapital / userConfig.divisions);

  // 실제 매수 가능 수량 계산 (LOC 체결가 = 오늘 종가 예상)
  const estimatedBuyPrice = todayClose;
  const estimatedBuyQuantity = estimatedBuyPrice > 0 ? Math.floor(availableCash / estimatedBuyPrice) : 0;
  const estimatedBuyAmount = estimatedBuyQuantity * estimatedBuyPrice;

  const tabItems = [
    {
      key: 'today',
      label: (
        <Space>
          <RocketOutlined />
          오늘 매매
        </Space>
      ),
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 오늘 요일 & 분할 현황 */}
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

          {/* 오늘 실행할 매매 요약 */}
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>📋</span>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 'bold' }}>오늘 실행할 매매</div>
                  <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 'normal' }}>
                    {todayDate} 종가 ${todayClose.toFixed(2)} 기준
                  </div>
                </div>
              </div>
            }
            style={{
              background: UI.COLORS.PRIMARY_GRADIENT,
              color: 'white',
              borderRadius: 12,
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
            }}
            styles={{ 
              header: { 
                color: 'white', 
                borderBottom: '1px solid rgba(255,255,255,0.2)',
                padding: '16px 24px'
              },
              body: { padding: '24px' }
            }}
          >
            <Row gutter={[16, 16]}>
              {effectiveMode === 'cash' ? (
                // 현금 보유 모드 — 매매 없음
                <Col span={24}>
                  <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>🛡️</div>
                    <div style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 12 }}>현금 보유 중</div>
                    <div style={{ fontSize: 15, opacity: 0.85, background: 'rgba(255,255,255,0.1)', padding: '12px 24px', borderRadius: 8, display: 'inline-block' }}>
                      RSI 하락장 감지 — 신규 매수 중단, 기존 분할 청산 후 대기
                    </div>
                  </div>
                </Col>
              ) : changePercent <= effectiveThresholds.buy * 100 && nextBuyDivision ? (
                // 매수 조건 충족
                <>
                  <Col xs={24} md={12}>
                    <div style={{
                      background: UI.COLORS.BUY_SIGNAL_BG,
                      padding: 24,
                      borderRadius: 12,
                      border: `2px solid ${UI.COLORS.BUY_SIGNAL_BORDER}`,
                      boxShadow: '0 4px 12px rgba(24, 144, 255, 0.2)'
                    }}>
                      <div style={{ fontSize: 14, marginBottom: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 24 }}>🚀</span>
                        <span style={{ fontWeight: 'bold' }}>매수 신호 발생!</span>
                      </div>
                      <div style={{ fontSize: 40, fontWeight: 'bold', marginBottom: 8 }}>{estimatedBuyQuantity}주</div>
                      <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 4 }}>
                        예상 체결가: ${estimatedBuyPrice.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 12 }}>
                        예상 투자금: ${estimatedBuyAmount.toFixed(0)}
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.2)', padding: '8px 12px', borderRadius: 6, fontSize: 13, opacity: 0.9 }}>
                        💡 전일 대비 {Math.abs(changePercent).toFixed(2)}% 하락 (조건: {Math.abs(effectiveThresholds.buy * 100).toFixed(1)}% 이상)
                      </div>
                    </div>
                  </Col>
                  <Col xs={24} md={12}>
                    <div style={{ background: UI.COLORS.CARD_BG, padding: 24, borderRadius: 12, border: UI.COLORS.CARD_BORDER }}>
                      <div style={{ fontSize: 14, marginBottom: 12, opacity: 0.6 }}>매도</div>
                      <div style={{ fontSize: 28, opacity: 0.6, marginBottom: 8 }}>대기 중</div>
                      <div style={{ fontSize: 13, opacity: 0.6 }}>
                        보유 중인 분할이 목표 수익률에<br />도달하면 매도 신호가 발생합니다
                      </div>
                    </div>
                  </Col>
                </>
              ) : realDivisions.some(d => d.status === 'HOLDING' && d.avgPrice > 0 && ((todayClose - d.avgPrice) / d.avgPrice >= effectiveThresholds.sell)) ? (
                // 매도 조건 충족
                <>
                  <Col xs={24} md={12}>
                    <div style={{ background: UI.COLORS.CARD_BG, padding: 24, borderRadius: 12, border: UI.COLORS.CARD_BORDER }}>
                      <div style={{ fontSize: 14, marginBottom: 12, opacity: 0.6 }}>매수</div>
                      <div style={{ fontSize: 28, opacity: 0.6, marginBottom: 8 }}>대기 중</div>
                      <div style={{ fontSize: 13, opacity: 0.6 }}>
                        전일 대비 {Math.abs(effectiveThresholds.buy * 100).toFixed(1)}% 이상 하락 시<br />매수 신호가 발생합니다
                      </div>
                    </div>
                  </Col>
                  <Col xs={24} md={12}>
                    <div style={{
                      background: UI.COLORS.SELL_SIGNAL_BG,
                      padding: 24,
                      borderRadius: 12,
                      border: `2px solid ${UI.COLORS.SELL_SIGNAL_BORDER}`,
                      boxShadow: '0 4px 12px rgba(82, 196, 26, 0.2)'
                    }}>
                      {(() => {
                        const sellDivs = realDivisions.filter(d => d.status === 'HOLDING' && d.avgPrice > 0 && ((todayClose - d.avgPrice) / d.avgPrice >= effectiveThresholds.sell));
                        const sellQty = sellDivs.reduce((sum, d) => sum + d.holdings, 0);
                        return (
                          <>
                            <div style={{ fontSize: 14, marginBottom: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 24 }}>💰</span>
                              <span style={{ fontWeight: 'bold' }}>매도 신호 발생!</span>
                            </div>
                            <div style={{ fontSize: 40, fontWeight: 'bold', marginBottom: 8 }}>{sellQty}주</div>
                            <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 4 }}>예상 체결가: ${todayClose.toFixed(2)}</div>
                            <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 4 }}>예상 매도금: ${(sellQty * todayClose).toFixed(0)}</div>
                            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '8px 12px', borderRadius: 6, fontSize: 13, opacity: 0.9, marginTop: 8 }}>
                              💡 목표 수익률 +{(effectiveThresholds.sell * 100).toFixed(1)}% 달성
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </Col>
                </>
              ) : (
                // 조건 미충족
                <Col span={24}>
                  <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>⏳</div>
                    <div style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 12 }}>관망 (대기 중)</div>
                    <div style={{ fontSize: 15, opacity: 0.85, background: 'rgba(255,255,255,0.1)', padding: '12px 24px', borderRadius: 8, display: 'inline-block' }}>
                      <div style={{ marginBottom: 8 }}>
                        📉 매수 조건: 전일 대비 <strong>{Math.abs(effectiveThresholds.buy * 100).toFixed(1)}%</strong> 필요 (현재: {changePercent.toFixed(2)}%)
                      </div>
                      <div>
                        📈 매도 조건: 보유 분할의 수익률 <strong>+{(effectiveThresholds.sell * 100).toFixed(1)}%</strong> 필요
                      </div>
                    </div>
                  </div>
                </Col>
              )}
            </Row>
          </Card>

          {/* 5분할 상태 대시보드 */}
          <DivisionStatusPanel
            divisionPortfolios={realDivisions}
            todayClose={todayClose}
            mode={config.mode}
          />
        </Space>
      )
    },
    {
      key: 'history',
      label: (
        <Space>
          <TableOutlined />
          거래 내역
        </Space>
      ),
      children: (
        <DongpaTradeTable
          trades={tradeHistory}
          loading={loading}
        />
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
          <TradeRecordForm onSave={() => {
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
              🚀 동파법 SOXL
            </Title>
            <Text
              type="secondary"
              className="hidden sm:inline text-xs sm:text-sm"
            >
              실시간 매매 신호 & 백테스팅
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
        {/* 로딩 오버레이 */}
        <Spin spinning={loading && tradeHistory.length === 0} size="large">
          <div style={{ minHeight: UI.MIN_HEIGHT }}>
            {/* 메인 탭 컨텐츠 */}
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={tabItems}
              size="large"
              tabBarStyle={{ marginBottom: 24 }}
            />
          </div>
        </Spin>

        {/* 면책조항 */}
        <Alert
          message="투자 유의사항"
          description={
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                본 시스템은 교육 및 분석 목적으로 제작되었습니다. 
                실제 투자 결정은 개인의 책임이며, 투자에 따른 손실에 대해 개발자는 책임지지 않습니다. 
                SOXL은 3배 레버리지 ETF로 높은 변동성과 리스크를 가지고 있으므로 신중한 투자 결정이 필요합니다.
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
