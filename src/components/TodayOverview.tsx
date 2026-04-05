'use client'

import React from 'react';
import { Card, Statistic, Row, Col, Tag, Space, Tooltip } from 'antd';
import { CalendarOutlined, DashboardOutlined, ArrowUpOutlined, ArrowDownOutlined, InfoCircleOutlined, SafetyOutlined, ThunderboltOutlined, CalculatorOutlined } from '@ant-design/icons';

interface RSIModeInfo {
  mode: 'safe' | 'aggressive' | 'bull' | 'cash';
  rsi: number | null;
  prevRSI: number | null;
  reason: string;
  signalStrength: {
    strength: number;
    label: string;
    color: string;
  };
  lastWeekDate: string | null;
  twoWeeksAgoDate: string | null;
}

interface TodayOverviewProps {
  divisionPortfolios?: any[];
  yesterdayClose: number;
  yesterdayDate: string;
  todayClose: number;
  todayDate: string;
  initialCapital: number;
  mode: 'safe' | 'aggressive' | 'auto';
  rsiModeInfo?: RSIModeInfo;
}

export const TodayOverview: React.FC<TodayOverviewProps> = ({
  divisionPortfolios = [],
  yesterdayClose,
  yesterdayDate,
  todayClose,
  todayDate,
  initialCapital,
  mode,
  rsiModeInfo
}) => {
  const today = new Date();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[today.getDay()];
  const dateStr = today.toLocaleDateString('ko-KR');

  // 분할 사용 현황 계산
  const holdingDivisions = divisionPortfolios.filter(d => d?.status === 'HOLDING').length;
  const totalDivisions = divisionPortfolios.length || 5;
  const emptyDivisions = totalDivisions - holdingDivisions;

  // 변화율 계산
  const change = todayClose - yesterdayClose;
  const changePercent = (change / yesterdayClose) * 100;

  // 총 자산 계산
  const totalCash = divisionPortfolios.reduce((sum, d) => sum + (d?.cash || 0), 0);
  const totalValue = divisionPortfolios.reduce(
    (sum, d) => sum + ((d?.holdings || 0) * todayClose),
    0
  );
  const totalAssets = totalCash + totalValue;
  
  // 총 수익률 계산 (초기자금 대비)
  const totalProfit = totalAssets - initialCapital;
  const totalProfitRate = initialCapital > 0 ? (totalProfit / initialCapital) * 100 : 0;

  // 실제 적용 모드 결정 (auto 모드면 RSI 기반)
  const actualMode = mode === 'auto' && rsiModeInfo ? rsiModeInfo.mode : mode;
  
  // 모드 정보
  const modeInfoMap = {
    safe:       { label: '안전모드', color: '#52c41a', icon: <SafetyOutlined />,       buyThreshold: -3.0, sellThreshold: 2.0,  maxHoldDays: 20 },
    aggressive: { label: '공세모드', color: '#ff4d4f', icon: <ThunderboltOutlined />,  buyThreshold: -5.0, sellThreshold: 8.0,  maxHoldDays: 7  },
    bull:       { label: '강세모드', color: '#52c41a', icon: <ThunderboltOutlined />,  buyThreshold: -3.0, sellThreshold: 12.0, maxHoldDays: 45 },
    cash:       { label: '현금보유', color: '#888888', icon: <SafetyOutlined />,       buyThreshold: 0,    sellThreshold: 0,    maxHoldDays: 0  },
    auto:       { label: '자동모드', color: '#1890ff', icon: <SafetyOutlined />,       buyThreshold: -3.0, sellThreshold: 2.0,  maxHoldDays: 20 }
  };
  const modeInfo = modeInfoMap[actualMode] || modeInfoMap.safe;

  return (
    <Card className="today-overview" style={{ marginBottom: 16 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6} lg={4}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
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

        <Col xs={24} sm={12} md={6} lg={4}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: '100%' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>현재 모드</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag
                  icon={modeInfo.icon}
                  color={actualMode === 'safe' ? 'success' : actualMode === 'bull' ? 'green' : 'error'}
                  style={{ fontSize: 14, padding: '4px 12px', margin: 0 }}
                >
                  {modeInfo.label}
                </Tag>
                <Tooltip 
                  title={
                    <div>
                      <div style={{ marginBottom: 8, fontWeight: 'bold' }}>{modeInfo.label} 상세 기준</div>
                      <div>• 매수 조건: {modeInfo.buyThreshold}% 이상 하락</div>
                      <div>• 매도 조건: +{modeInfo.sellThreshold}% 수익</div>
                      <div>• 최대 보유: {modeInfo.maxHoldDays}일</div>
                      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                        {actualMode === 'safe' 
                          ? '💡 초보자에게 추천하는 안정적인 전략' 
                          : '⚡ 높은 수익률과 위험을 감수하는 공격적 전략'}
                      </div>
                    </div>
                  }
                  placement="bottomLeft"
                >
                  <InfoCircleOutlined style={{ color: '#1890ff', cursor: 'pointer', fontSize: 16 }} />
                </Tooltip>
                {mode === 'auto' && rsiModeInfo && (
                  <Tooltip
                    title={
                      <div>
                        <div style={{ marginBottom: 8, fontWeight: 'bold' }}>📊 주간 RSI 기반 모드 계산</div>
                        <div style={{ marginBottom: 6 }}>
                          <strong>지난주 RSI:</strong> {rsiModeInfo.rsi?.toFixed(2) || 'N/A'}
                          {rsiModeInfo.lastWeekDate && (
                            <span style={{ fontSize: 11, opacity: 0.8, marginLeft: 4 }}>
                              ({rsiModeInfo.lastWeekDate})
                            </span>
                          )}
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          <strong>지지난주 RSI:</strong> {rsiModeInfo.prevRSI?.toFixed(2) || 'N/A'}
                          {rsiModeInfo.twoWeeksAgoDate && (
                            <span style={{ fontSize: 11, opacity: 0.8, marginLeft: 4 }}>
                              ({rsiModeInfo.twoWeeksAgoDate})
                            </span>
                          )}
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          <strong>주간 변화:</strong>{' '}
                          {rsiModeInfo.rsi && rsiModeInfo.prevRSI ? (
                            <span style={{ 
                              color: rsiModeInfo.rsi > rsiModeInfo.prevRSI ? '#52c41a' : '#ff4d4f' 
                            }}>
                              {rsiModeInfo.rsi > rsiModeInfo.prevRSI ? '▲' : '▼'}{' '}
                              {Math.abs(rsiModeInfo.rsi - rsiModeInfo.prevRSI).toFixed(2)}
                            </span>
                          ) : 'N/A'}
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          <strong>신호 강도:</strong> {rsiModeInfo.signalStrength.label}
                        </div>
                        <div style={{ 
                          marginTop: 8, 
                          paddingTop: 8, 
                          borderTop: '1px solid rgba(255,255,255,0.2)',
                          fontSize: 12,
                          opacity: 0.9
                        }}>
                          💡 {rsiModeInfo.reason}
                        </div>
                        <div style={{ 
                          marginTop: 8,
                          fontSize: 11,
                          opacity: 0.7
                        }}>
                          ※ 매주 금요일 종가 기준, 14주 기간으로 계산
                        </div>
                      </div>
                    }
                    placement="bottomLeft"
                  >
                    <CalculatorOutlined style={{ color: '#faad14', cursor: 'pointer', fontSize: 16 }} />
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </Col>

        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic
            title={`${yesterdayDate} 종가`}
            value={yesterdayClose}
            precision={2}
            prefix="$"
            valueStyle={{ fontSize: 18 }}
          />
        </Col>

        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic
            title={`${todayDate} 종가`}
            value={todayClose}
            precision={2}
            prefix="$"
            valueStyle={{
              fontSize: 18,
              color: change >= 0 ? '#3f8600' : '#cf1322'
            }}
            suffix={
              <span style={{ fontSize: 13, marginLeft: 8 }}>
                {change >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                {Math.abs(changePercent).toFixed(2)}%
              </span>
            }
          />
        </Col>

        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic
            title="분할 사용 현황"
            value={holdingDivisions}
            suffix={`/ ${totalDivisions}`}
            valueStyle={{ color: holdingDivisions > (totalDivisions * 0.6) ? '#ff4d4f' : '#3f8600', fontSize: 18 }}
            prefix={<DashboardOutlined />}
          />
        </Col>

        <Col xs={12} sm={8} md={6} lg={4}>
          <Statistic
            title="총 수익률"
            value={totalProfitRate}
            precision={2}
            suffix="%"
            valueStyle={{ 
              color: totalProfitRate >= 0 ? '#3f8600' : '#cf1322',
              fontSize: 18
            }}
            prefix={totalProfitRate >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          />
        </Col>
      </Row>

      <div style={{ marginTop: 16 }}>
        <Space wrap>
          <Tag color="blue">현금: ${totalCash.toFixed(2)}</Tag>
          <Tag color="green">평가액: ${totalValue.toFixed(2)}</Tag>
          <Tag color="gold">총 자산: ${totalAssets.toFixed(2)}</Tag>
          <Tag color={emptyDivisions < 2 ? 'red' : 'cyan'}>
            비어있는 분할: {emptyDivisions}개
          </Tag>
        </Space>
      </div>
    </Card>
  );
};
