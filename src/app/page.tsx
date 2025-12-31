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
import { calculateDivisionStates } from '@/utils/divisionStateCalculator';
import { DongpaConfig } from '@/types';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

// localStorage에서 설정 로드
const loadConfigFromStorage = (): DongpaConfig => {
  if (typeof window === 'undefined') {
    return {
      initialCapital: 10000,
      divisions: 5,
      mode: 'auto',
      rebalancePeriod: 10
    };
  }

  const saved = localStorage.getItem('dongpaConfig');
  if (saved) {
    return JSON.parse(saved);
  }

  return {
    initialCapital: 10000,
    divisions: 5,
    mode: 'auto',
    rebalancePeriod: 10
  };
};

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('today');
  const [realDivisions, setRealDivisions] = useState<any[]>([]);
  const [userConfig, setUserConfig] = useState<DongpaConfig>(loadConfigFromStorage());

  // localStorage 초기화 및 실제 분할 상태 로드
  React.useEffect(() => {
    const config = loadConfigFromStorage();
    setUserConfig(config);
    loadDivisionStates(config.initialCapital);

    // 매매 기록 변경 감지를 위한 이벤트 리스너
    const handleStorageChange = () => {
      const config = loadConfigFromStorage();
      loadDivisionStates(config.initialCapital);
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const loadDivisionStates = (capital?: number) => {
    const divisions = calculateDivisionStates(capital || userConfig.initialCapital);
    setRealDivisions(divisions);
  };

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

  // 어제 종가와 오늘 종가 계산
  const yesterdayClose = historicalData.length > 1 
    ? historicalData[historicalData.length - 2].price 
    : currentPrice;
  const yesterdayDate = historicalData.length > 1
    ? historicalData[historicalData.length - 2].date
    : '';
  const todayClose = historicalData.length > 0 
    ? historicalData[historicalData.length - 1].price 
    : currentPrice;
  const todayDate = historicalData.length > 0
    ? historicalData[historicalData.length - 1].date
    : '';

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
                    {yesterdayDate} 종가 ${yesterdayClose.toFixed(2)} 기준
                  </div>
                </div>
              </div>
            }
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
              {changePercent <= -3.0 ? (
                // 매수 조건 충족
                <>
                  <Col xs={24} md={12}>
                    <div style={{ 
                      background: 'linear-gradient(135deg, rgba(24, 144, 255, 0.3) 0%, rgba(24, 144, 255, 0.15) 100%)',
                      padding: 24, 
                      borderRadius: 12,
                      border: '2px solid rgba(24, 144, 255, 0.5)',
                      boxShadow: '0 4px 12px rgba(24, 144, 255, 0.2)'
                    }}>
                      <div style={{ fontSize: 14, marginBottom: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 24 }}>🚀</span>
                        <span style={{ fontWeight: 'bold' }}>매수 신호 발생!</span>
                      </div>
                      <div style={{ fontSize: 40, fontWeight: 'bold', marginBottom: 8 }}>70주</div>
                      <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 4 }}>
                        예상 체결가: ${todayClose.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 12 }}>
                        예상 투자금: ${(70 * todayClose).toFixed(0)}
                      </div>
                      <div style={{ 
                        background: 'rgba(255,255,255,0.2)', 
                        padding: '8px 12px', 
                        borderRadius: 6,
                        fontSize: 13,
                        opacity: 0.9
                      }}>
                        💡 전일 대비 {Math.abs(changePercent).toFixed(2)}% 하락 (조건: -3.0% 이상)
                      </div>
                    </div>
                  </Col>
                  <Col xs={24} md={12}>
                    <div style={{ 
                      background: 'rgba(255,255,255,0.08)', 
                      padding: 24, 
                      borderRadius: 12,
                      border: '1px dashed rgba(255,255,255,0.3)'
                    }}>
                      <div style={{ fontSize: 14, marginBottom: 12, opacity: 0.6 }}>매도</div>
                      <div style={{ fontSize: 28, opacity: 0.6, marginBottom: 8 }}>대기 중</div>
                      <div style={{ fontSize: 13, opacity: 0.6 }}>
                        보유 중인 분할이 목표 수익률에<br />도달하면 매도 신호가 발생합니다
                      </div>
                    </div>
                  </Col>
                </>
              ) : realDivisions.some(d => d.status === 'HOLDING' && ((todayClose - d.avgPrice) / d.avgPrice >= 0.002)) ? (
                // 매도 조건 충족
                <>
                  <Col xs={24} md={12}>
                    <div style={{ 
                      background: 'rgba(255,255,255,0.08)', 
                      padding: 24, 
                      borderRadius: 12,
                      border: '1px dashed rgba(255,255,255,0.3)'
                    }}>
                      <div style={{ fontSize: 14, marginBottom: 12, opacity: 0.6 }}>매수</div>
                      <div style={{ fontSize: 28, opacity: 0.6, marginBottom: 8 }}>대기 중</div>
                      <div style={{ fontSize: 13, opacity: 0.6 }}>
                        전일 대비 -3.0% 이상 하락 시<br />매수 신호가 발생합니다
                      </div>
                    </div>
                  </Col>
                  <Col xs={24} md={12}>
                    <div style={{ 
                      background: 'linear-gradient(135deg, rgba(82, 196, 26, 0.3) 0%, rgba(82, 196, 26, 0.15) 100%)',
                      padding: 24, 
                      borderRadius: 12,
                      border: '2px solid rgba(82, 196, 26, 0.5)',
                      boxShadow: '0 4px 12px rgba(82, 196, 26, 0.2)'
                    }}>
                      <div style={{ fontSize: 14, marginBottom: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 24 }}>💰</span>
                        <span style={{ fontWeight: 'bold' }}>매도 신호 발생!</span>
                      </div>
                      <div style={{ fontSize: 40, fontWeight: 'bold', marginBottom: 8 }}>
                        {realDivisions.filter(d => d.status === 'HOLDING' && ((todayClose - d.avgPrice) / d.avgPrice >= 0.002)).reduce((sum, d) => sum + d.holdings, 0)}주
                      </div>
                      <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 4 }}>
                        예상 체결가: ${todayClose.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 15, opacity: 0.95, marginBottom: 4 }}>
                        예상 매도금: ${(realDivisions.filter(d => d.status === 'HOLDING' && ((todayClose - d.avgPrice) / d.avgPrice >= 0.002)).reduce((sum, d) => sum + d.holdings, 0) * todayClose).toFixed(0)}
                      </div>
                      <div style={{ 
                        background: 'rgba(255,255,255,0.2)', 
                        padding: '8px 12px', 
                        borderRadius: 6,
                        fontSize: 13,
                        opacity: 0.9,
                        marginTop: 8
                      }}>
                        💡 목표 수익률 +0.2% 달성
                      </div>
                    </div>
                  </Col>
                </>
              ) : (
                // 조건 미충족
                <Col span={24}>
                  <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>⏳</div>
                    <div style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 12 }}>관망 (대기 중)</div>
                    <div style={{ 
                      fontSize: 15, 
                      opacity: 0.85,
                      background: 'rgba(255,255,255,0.1)',
                      padding: '12px 24px',
                      borderRadius: 8,
                      display: 'inline-block'
                    }}>
                      <div style={{ marginBottom: 8 }}>
                        📉 매수 조건: 전일 대비 <strong>-3.0%</strong> 필요 (현재: {changePercent.toFixed(2)}%)
                      </div>
                      <div>
                        📈 매도 조건: 보유 분할의 수익률 <strong>+0.2%</strong> 필요
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
          <TradeRecordForm onSave={() => loadDivisionStates()} />

          {/* 매매 기록 목록 */}
          <TradeRecordList />
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
                message="안전모드 (초보자 추천)"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    <li>매수 조건: 전일 대비 -3.0% 이상 하락</li>
                    <li>매도 조건: +0.2% 수익 또는 30일 경과</li>
                    <li>5분할 독립 운영</li>
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
                    <p style={{ marginBottom: 0 }}><strong>4. 자동 손절:</strong> 최대 보유기간 도달 시 자동 매도</p>
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
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
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
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
          <div style={{ minHeight: 400 }}>
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
