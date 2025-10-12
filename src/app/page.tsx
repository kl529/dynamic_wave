'use client'

import React, { useState } from 'react';
import { Layout, Tabs, Typography, Space, Button, Alert, Spin, Card, Row, Col } from 'antd';
import {
  DashboardOutlined,
  AreaChartOutlined,
  SettingOutlined,
  TableOutlined,
  RocketOutlined,
  InfoCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { ConfigPanel } from '@/components/ConfigPanel';
import { TodaySignalPanel } from '@/components/TodaySignalPanel';
import { DongpaTradeTable } from '@/components/DongpaTradeTable';
import { TodayOverview } from '@/components/TodayOverview';
import { DivisionStatusPanel } from '@/components/DivisionStatusPanel';
import { TradeRecordForm } from '@/components/TradeRecordForm';
import { TradeRecordList } from '@/components/TradeRecordList';
import { useDongpaEngine } from '@/hooks/useDongpaEngine';
import { generateMockDivisions, getMockClosingPrices, initializeMockData } from '@/utils/mockData';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const initialConfig = {
  initialCapital: 10000,
  divisions: 5, // 5분할 고정
  mode: 'safe' as const
};

export default function Home() {
  const [activeTab, setActiveTab] = useState('today');

  // 더미 데이터 초기화
  React.useEffect(() => {
    initializeMockData();
  }, []);

  // 더미 데이터
  const mockDivisions = generateMockDivisions();
  const mockPrices = getMockClosingPrices();

  const {
    config,
    loading,
    lastUpdate,
    historicalData,
    tradeHistory,
    latestTrade,
    currentPrice,
    changePercent,
    todaySignal,
    strategyInfo,
    loadHistoricalData,
    refreshCurrentPrice,
    updateRealtimeData
  } = useDongpaEngine({ config: initialConfig });

  const tabItems = [
    {
      key: 'today',
      label: (
        <Space>
          <RocketOutlined />
          오늘 매매 신호
        </Space>
      ),
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 오늘 요일 & 분할 현황 */}
          <TodayOverview
            divisionPortfolios={mockDivisions}
            yesterdayClose={mockPrices.yesterday}
            todayClose={mockPrices.today}
          />

          {/* 5분할 상태 대시보드 */}
          <DivisionStatusPanel
            divisionPortfolios={mockDivisions}
            todayClose={mockPrices.today}
            mode={config.mode}
          />

          {/* 오늘 매매 신호 */}
          <TodaySignalPanel
            signal={todaySignal}
            currentPrice={mockPrices.today}
            changePercent={mockPrices.changePercent}
            loading={loading}
            onRefresh={refreshCurrentPrice}
          />

          {/* 오늘 실행할 매매 요약 */}
          <Card
            title="📋 오늘 실행할 매매"
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white'
            }}
            headStyle={{ color: 'white', borderBottom: '1px solid rgba(255,255,255,0.2)' }}
          >
            <Row gutter={[24, 24]}>
              {mockPrices.changePercent <= -3.0 ? (
                // 매수 조건 충족
                <>
                  <Col xs={24} sm={12}>
                    <div style={{ background: 'rgba(255,255,255,0.2)', padding: 20, borderRadius: 8 }}>
                      <div style={{ fontSize: 16, marginBottom: 8, opacity: 0.9 }}>매수 신호</div>
                      <div style={{ fontSize: 32, fontWeight: 'bold' }}>🚀 70주</div>
                      <div style={{ fontSize: 14, marginTop: 8, opacity: 0.9 }}>
                        @${mockPrices.today.toFixed(2)} = ${(70 * mockPrices.today).toFixed(0)}
                      </div>
                    </div>
                  </Col>
                  <Col xs={24} sm={12}>
                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: 20, borderRadius: 8 }}>
                      <div style={{ fontSize: 16, marginBottom: 8, opacity: 0.7 }}>매도</div>
                      <div style={{ fontSize: 24, opacity: 0.7 }}>조건 미충족</div>
                    </div>
                  </Col>
                </>
              ) : mockDivisions.some(d => d.status === 'HOLDING' && ((mockPrices.today - d.avgPrice) / d.avgPrice >= 0.002)) ? (
                // 매도 조건 충족
                <>
                  <Col xs={24} sm={12}>
                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: 20, borderRadius: 8 }}>
                      <div style={{ fontSize: 16, marginBottom: 8, opacity: 0.7 }}>매수</div>
                      <div style={{ fontSize: 24, opacity: 0.7 }}>조건 미충족</div>
                    </div>
                  </Col>
                  <Col xs={24} sm={12}>
                    <div style={{ background: 'rgba(255,255,255,0.2)', padding: 20, borderRadius: 8 }}>
                      <div style={{ fontSize: 16, marginBottom: 8, opacity: 0.9 }}>매도 신호</div>
                      <div style={{ fontSize: 32, fontWeight: 'bold' }}>💰 68주</div>
                      <div style={{ fontSize: 14, marginTop: 8, opacity: 0.9 }}>
                        @${mockPrices.today.toFixed(2)} = ${(68 * mockPrices.today).toFixed(0)}
                      </div>
                      <div style={{ fontSize: 12, marginTop: 4, color: '#52c41a' }}>
                        예상수익: +$12.50
                      </div>
                    </div>
                  </Col>
                </>
              ) : (
                // 조건 미충족
                <Col span={24}>
                  <div style={{ textAlign: 'center', padding: 30 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                    <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>관망</div>
                    <div style={{ fontSize: 14, opacity: 0.8 }}>
                      매수: -{Math.abs(mockPrices.changePercent).toFixed(2)}% 하락 (3.0% 필요) |
                      매도: 수익 목표가 미달성
                    </div>
                  </div>
                </Col>
              )}
            </Row>
          </Card>
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
          <TradeRecordForm onSave={() => window.location.reload()} />
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
            config={config}
            onConfigChange={(newConfig) => {
              // 설정 변경 시 데이터 다시 로드
              loadHistoricalData();
            }}
            divisionAmount={config.initialCapital / config.divisions}
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
          
          {/* 우측: 오늘 종가 */}
          <div className="flex flex-col items-end min-w-fit">
            <div className="text-sm sm:text-base lg:text-lg font-bold whitespace-nowrap">
              SOXL ${mockPrices.today.toFixed(2)}
            </div>
            <Text
              className="text-xs sm:text-sm font-medium whitespace-nowrap"
              style={{
                color: mockPrices.changePercent >= 0 ? '#3f8600' : '#cf1322'
              }}
            >
              {mockPrices.changePercent >= 0 ? '+' : ''}{mockPrices.changePercent.toFixed(2)}%
            </Text>
            <Text className="text-xs text-gray-400">
              오늘 종가
            </Text>
          </div>
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