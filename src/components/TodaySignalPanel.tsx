'use client'

import React from 'react';
import { Card, Row, Col, Tag, Alert, Statistic, Space, Button, Tooltip } from 'antd';
import { 
  ArrowUpOutlined, 
  ArrowDownOutlined, 
  DollarOutlined,
  ShoppingCartOutlined,
  BankOutlined,
  LineChartOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { TodaySignal } from '@/types';

interface TodaySignalPanelProps {
  signal: TodaySignal;
  currentPrice: number;
  changePercent: number;
  loading?: boolean;
  onRefresh?: () => void;
}

export const TodaySignalPanel: React.FC<TodaySignalPanelProps> = ({
  signal,
  currentPrice,
  changePercent,
  loading = false,
  onRefresh
}) => {
  const { 매수신호, 매도신호 } = signal;

  // 신호 우선순위: 매도 > 매수 > 관망
  const primarySignal = 매도신호.신호 === 'SELL' ? 매도신호 : 매수신호;
  const isPrimarySell = 매도신호.신호 === 'SELL';
  const isPrimaryBuy = 매수신호.신호 === 'BUY' && 매도신호.신호 !== 'SELL';
  const isHold = !isPrimarySell && !isPrimaryBuy;

  // 신호 색상 및 아이콘
  const getSignalColor = () => {
    if (isPrimarySell) return '#f5222d'; // 빨강
    if (isPrimaryBuy) return '#1890ff';  // 파랑
    return '#8c8c8c'; // 회색
  };

  const getSignalIcon = () => {
    if (isPrimarySell) return <ArrowDownOutlined />;
    if (isPrimaryBuy) return <ArrowUpOutlined />;
    return <LineChartOutlined />;
  };

  const getSignalText = () => {
    if (isPrimarySell) return '🔥 매도 신호';
    if (isPrimaryBuy) return '🚀 매수 신호';
    return '⏳ 관망';
  };

  const getAlertType = (): "success" | "info" | "warning" | "error" => {
    if (isPrimarySell) return 'error';   // 매도는 빨강
    if (isPrimaryBuy) return 'info';     // 매수는 파랑
    return 'warning'; // 관망은 노랑
  };

  return (
    <div className="space-y-4">
      {/* 현재가 및 주요 신호 */}
      <Card size="small">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <div className="text-center">
              <div className="text-lg font-semibold mb-1">SOXL 현재가</div>
              <div className="text-3xl font-bold font-mono">
                ${currentPrice.toFixed(2)}
              </div>
              <Tag 
                color={changePercent >= 0 ? 'green' : 'red'} 
                className="text-lg font-bold mt-2"
              >
                {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
              </Tag>
            </div>
          </Col>
          
          <Col xs={24} sm={16}>
            <Alert
              message={getSignalText()}
              description={
                <div className="space-y-2">
                  <div className="text-lg font-semibold">
                    {isPrimarySell ? 매도신호.메시지 : 매수신호.메시지}
                  </div>
                  {isPrimarySell && (
                    <div className="text-sm">
                      🎯 목표수익률: {매도신호.목표수익률.toFixed(2)}% |
                      실현수익: ${매도신호.실현수익.toFixed(2)}
                    </div>
                  )}
                  {isPrimaryBuy && (
                    <div className="text-sm">
                      💰 매수금액: ${매수신호.매수금액.toFixed(0)} | 
                      수수료: ${매수신호.수수료.toFixed(2)}
                    </div>
                  )}
                </div>
              }
              type={getAlertType()}
              icon={getSignalIcon()}
              showIcon
              action={
                onRefresh && (
                  <Button 
                    size="small" 
                    onClick={onRefresh}
                    loading={loading}
                  >
                    새로고침
                  </Button>
                )
              }
            />
          </Col>
        </Row>
      </Card>

      {/* 상세 신호 정보 */}
      <Row gutter={[16, 16]}>
        {/* 매수 신호 카드 */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <ShoppingCartOutlined style={{ color: '#1890ff' }} />
                <span>매수 신호</span>
                {매수신호.신호 === 'BUY' && (
                  <Tag color="processing">활성</Tag>
                )}
              </Space>
            }
            size="small"
            className={매수신호.신호 === 'BUY' ? 'border-blue-300 shadow-md' : ''}
          >
            <div className="space-y-3">
              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <Statistic
                    title="매수량"
                    value={매수신호.매수량}
                    suffix="주"
                    valueStyle={{
                      fontSize: '16px',
                      color: 매수신호.신호 === 'BUY' ? '#1890ff' : '#8c8c8c'
                    }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="LOC 체결가"
                    value={매수신호.매수가 || currentPrice}
                    prefix={<DollarOutlined />}
                    precision={2}
                    valueStyle={{
                      fontSize: '16px',
                      color: 매수신호.신호 === 'BUY' ? '#1890ff' : '#8c8c8c'
                    }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="오늘 하락률"
                    value={매수신호.하락률}
                    suffix="%"
                    precision={2}
                    valueStyle={{
                      fontSize: '16px',
                      color: 매수신호.하락률 <= 매수신호.목표하락률 ? '#52c41a' : '#8c8c8c'
                    }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="목표 하락률"
                    value={매수신호.목표하락률}
                    suffix="%"
                    precision={2}
                    valueStyle={{ fontSize: '16px' }}
                  />
                </Col>
              </Row>
              
              <Alert
                message={매수신호.메시지}
                type={매수신호.신호 === 'BUY' ? 'info' : 'warning'}
                showIcon
              />
            </div>
          </Card>
        </Col>

        {/* 매도 신호 카드 */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <BankOutlined style={{ color: '#f5222d' }} />
                <span>매도 신호</span>
                {매도신호.신호 === 'SELL' && (
                  <Tag color="error">활성</Tag>
                )}
                {매도신호.신호 === 'NO_POSITION' && (
                  <Tag color="default">보유없음</Tag>
                )}
              </Space>
            }
            size="small"
            className={매도신호.신호 === 'SELL' ? 'border-red-300 shadow-md' : ''}
          >
            <div className="space-y-3">
              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <Statistic
                    title="매도량"
                    value={매도신호.매도량}
                    suffix="주"
                    valueStyle={{
                      fontSize: '16px',
                      color: 매도신호.신호 === 'SELL' ? '#f5222d' : '#8c8c8c'
                    }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="LOC 체결가"
                    value={매도신호.매도가 || currentPrice}
                    prefix={<DollarOutlined />}
                    precision={2}
                    valueStyle={{
                      fontSize: '16px',
                      color: 매도신호.신호 === 'SELL' ? '#f5222d' : '#8c8c8c'
                    }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="현재 수익률"
                    value={매도신호.수익률}
                    suffix="%"
                    precision={2}
                    valueStyle={{
                      fontSize: '16px',
                      color: 매도신호.수익률 >= 매도신호.목표수익률 ? '#52c41a' : '#f5222d'
                    }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="목표 수익률"
                    value={매도신호.목표수익률}
                    suffix="%"
                    precision={2}
                    valueStyle={{ fontSize: '16px' }}
                  />
                </Col>
              </Row>

              {매도신호.수익률 < 매도신호.목표수익률 && 매도신호.신호 !== 'NO_POSITION' && (
                <div className="bg-orange-50 p-2 rounded">
                  <Tooltip title="목표 수익률 달성을 위해 필요한 상승률">
                    <Space>
                      <InfoCircleOutlined className="text-orange-500" />
                      <span className="text-sm">
                        {(매도신호.목표수익률 - 매도신호.수익률).toFixed(2)}% 더 상승 필요
                      </span>
                    </Space>
                  </Tooltip>
                </div>
              )}
              
              <Alert
                message={매도신호.메시지}
                type={
                  매도신호.신호 === 'SELL' ? 'error' :
                  매도신호.신호 === 'NO_POSITION' ? 'info' : 'warning'
                }
                showIcon
              />
            </div>
          </Card>
        </Col>
      </Row>

      {/* 추가 정보 */}
      <Card title="💡 거래 가이드" size="small">
        <Row gutter={[16, 8]}>
          <Col xs={24} sm={12}>
            <div className="bg-blue-50 p-3 rounded">
              <h4 className="text-blue-600 font-semibold mb-2">📊 매수 조건</h4>
              <ul className="text-sm space-y-1 text-blue-800">
                <li>• 안전모드: 3.0% 이상 하락</li>
                <li>• 공세모드: 5.0% 이상 하락</li>
                <li>• 충분한 예수금 보유</li>
              </ul>
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div className="bg-red-50 p-3 rounded">
              <h4 className="text-red-600 font-semibold mb-2">💰 매도 조건</h4>
              <ul className="text-sm space-y-1 text-red-800">
                <li>• 안전모드: 0.2% 수익</li>
                <li>• 공세모드: 2.5% 수익</li>
                <li>• 보유 주식이 있을 때</li>
              </ul>
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  );
};