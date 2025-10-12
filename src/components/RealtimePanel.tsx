'use client'

import React from 'react';
import { Card, Statistic, Row, Col, Button, Space, Tag, Typography, Alert, Tooltip } from 'antd';
import {
  ReloadOutlined,
  RiseOutlined,
  FallOutlined,
  DollarOutlined,
  BellOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { RealtimeQuote } from '@/types';

const { Title, Text } = Typography;

interface RealtimePanelProps {
  realtimeData: RealtimeQuote | null;
  tradingSignals: any;
  nextPrices: { buyPrice: number | null; sellPrice: number | null };
  onRefresh: () => void;
  loading: boolean;
  lastUpdate: Date | null;
}

export const RealtimePanel: React.FC<RealtimePanelProps> = ({
  realtimeData,
  tradingSignals,
  nextPrices,
  onRefresh,
  loading,
  lastUpdate
}) => {
  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'BUY': return 'success';
      case 'SELL': return 'error';
      default: return 'default';
    }
  };

  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case 'BUY': return <RiseOutlined />;
      case 'SELL': return <FallOutlined />;
      default: return null;
    }
  };

  const getCurrentSignalMessage = (signal: string) => {
    switch (signal) {
      case 'BUY':
        return '매수 신호 발생! 지금이 매수 타이밍입니다.';
      case 'SELL':
        return '매도 신호 발생! 수익 실현을 고려해보세요.';
      default:
        return '현재 관망 상태입니다. 다음 신호를 기다려주세요.';
    }
  };

  return (
    <div>
      {/* 실시간 주가 정보 */}
      <Card
        title={
          <Space>
            <DollarOutlined />
            <span>SOXL 실시간 정보</span>
            <Button 
              icon={<ReloadOutlined />} 
              size="small" 
              onClick={onRefresh}
              loading={loading}
            >
              새로고침
            </Button>
          </Space>
        }
        extra={
          lastUpdate && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              마지막 업데이트: {lastUpdate.toLocaleTimeString()}
            </Text>
          )
        }
      >
        {realtimeData ? (
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={6}>
              <Statistic
                title="현재가"
                value={realtimeData.price}
                prefix="$"
                precision={2}
                valueStyle={{ fontSize: '24px', fontWeight: 'bold' }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="변동금액"
                value={realtimeData.change}
                prefix={realtimeData.change >= 0 ? '+$' : '-$'}
                precision={2}
                valueStyle={{ 
                  color: realtimeData.change >= 0 ? '#3f8600' : '#cf1322',
                  fontSize: '18px'
                }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="변동률"
                value={Math.abs(realtimeData.changePercent)}
                suffix="%"
                prefix={realtimeData.changePercent >= 0 ? '+' : '-'}
                precision={2}
                valueStyle={{ 
                  color: realtimeData.changePercent >= 0 ? '#3f8600' : '#cf1322',
                  fontSize: '18px'
                }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="거래량"
                value={realtimeData.volume}
                formatter={(value) => `${Number(value).toLocaleString()}`}
                valueStyle={{ fontSize: '16px' }}
              />
            </Col>
          </Row>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Text type="secondary">데이터를 불러오는 중...</Text>
          </div>
        )}
      </Card>

      {/* 매매 신호 */}
      <Card
        title={
          <Space>
            <BellOutlined />
            <span>매매 신호</span>
          </Space>
        }
        style={{ marginTop: 16 }}
      >
        {tradingSignals ? (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* 현재 신호 */}
            <Alert
              message={
                <Space>
                  {getSignalIcon(tradingSignals.currentSignal)}
                  <Text strong>
                    {tradingSignals.currentSignal === 'BUY' && '매수 신호'}
                    {tradingSignals.currentSignal === 'SELL' && '매도 신호'}
                    {tradingSignals.currentSignal === 'HOLD' && '관망'}
                  </Text>
                  <Tag color={getSignalColor(tradingSignals.currentSignal)}>
                    {tradingSignals.currentSignal}
                  </Tag>
                </Space>
              }
              description={getCurrentSignalMessage(tradingSignals.currentSignal)}
              type={
                tradingSignals.currentSignal === 'BUY' ? 'success' :
                tradingSignals.currentSignal === 'SELL' ? 'warning' : 'info'
              }
              showIcon
            />

            {/* 다음 매매가 정보 */}
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <Card size="small" title="다음 매수가">
                  {nextPrices.buyPrice ? (
                    <div>
                      <Text style={{ fontSize: '20px', fontWeight: 'bold', color: '#52c41a' }}>
                        ${nextPrices.buyPrice}
                      </Text>
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          현재가 대비 {realtimeData ? 
                            (((nextPrices.buyPrice - realtimeData.price) / realtimeData.price * 100)).toFixed(1) 
                            : '0'}%
                        </Text>
                      </div>
                    </div>
                  ) : (
                    <Text type="secondary">계산 중...</Text>
                  )}
                </Card>
              </Col>
              
              <Col xs={24} sm={12}>
                <Card size="small" title="다음 매도가">
                  {nextPrices.sellPrice ? (
                    <div>
                      <Text style={{ fontSize: '20px', fontWeight: 'bold', color: '#f5222d' }}>
                        ${nextPrices.sellPrice}
                      </Text>
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          평단가 대비 +{tradingSignals.mode === 'safe' ? '0.2' : '2.5'}%
                        </Text>
                      </div>
                    </div>
                  ) : (
                    <Text type="secondary">보유 시 표시</Text>
                  )}
                </Card>
              </Col>
            </Row>

            {/* 포트폴리오 현황 */}
            <Card size="small" title="현재 포트폴리오">
              <Row gutter={[16, 8]}>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="보유 현금"
                    value={tradingSignals.cashRemaining}
                    prefix="$"
                    precision={0}
                    valueStyle={{ fontSize: '16px' }}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="보유 주식"
                    value={tradingSignals.currentHoldings}
                    suffix="주"
                    precision={0}
                    valueStyle={{ fontSize: '16px' }}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="평단가"
                    value={tradingSignals.avgPrice || 0}
                    prefix="$"
                    precision={2}
                    valueStyle={{ fontSize: '16px' }}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="총 자산"
                    value={tradingSignals.totalAssets}
                    prefix="$"
                    precision={0}
                    valueStyle={{ 
                      fontSize: '16px',
                      color: tradingSignals.returnRate >= 0 ? '#3f8600' : '#cf1322'
                    }}
                  />
                </Col>
              </Row>
              
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <Statistic
                  title="수익률"
                  value={tradingSignals.returnRate}
                  suffix="%"
                  precision={2}
                  prefix={tradingSignals.returnRate >= 0 ? '+' : ''}
                  valueStyle={{ 
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: tradingSignals.returnRate >= 0 ? '#3f8600' : '#cf1322'
                  }}
                />
              </div>
            </Card>
          </Space>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Text type="secondary">신호를 계산하는 중...</Text>
          </div>
        )}
      </Card>
    </div>
  );
};