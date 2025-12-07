'use client'

import React from 'react';
import { Card, Row, Col, Statistic, Tag, Progress, Typography, Space } from 'antd';
import { DollarOutlined, RiseOutlined, FallOutlined, WalletOutlined, StockOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

interface DivisionPortfolio {
  cash: number;
  holdings: number;
  avgPrice: number;
  buyDate: string | null;
  status: 'EMPTY' | 'HOLDING';
  mode: 'safe' | 'aggressive';
}

interface CurrentInvestmentStatusProps {
  divisions: DivisionPortfolio[];
  currentPrice: number;
  initialCapital: number;
}

export const CurrentInvestmentStatus: React.FC<CurrentInvestmentStatusProps> = ({
  divisions,
  currentPrice,
  initialCapital
}) => {
  // 전체 통계 계산
  const totalCash = divisions.reduce((sum, div) => sum + div.cash, 0);
  const totalHoldings = divisions.reduce((sum, div) => sum + div.holdings, 0);
  const totalValue = totalHoldings * currentPrice;
  const totalAssets = totalCash + totalValue;
  const totalInvested = initialCapital - totalCash;
  const totalPL = totalAssets - initialCapital;
  const totalPLRate = ((totalAssets - initialCapital) / initialCapital) * 100;

  // 보유 분할 수
  const holdingDivisions = divisions.filter(d => d.status === 'HOLDING').length;
  const emptyDivisions = divisions.length - holdingDivisions;

  // 평균 수익률 계산 (보유 중인 분할만)
  const holdingDivisionsData = divisions.filter(d => d.status === 'HOLDING');
  const avgProfitRate = holdingDivisionsData.length > 0
    ? holdingDivisionsData.reduce((sum, div) => {
        const profitRate = ((currentPrice - div.avgPrice) / div.avgPrice) * 100;
        return sum + profitRate;
      }, 0) / holdingDivisionsData.length
    : 0;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* 전체 자산 현황 */}
      <Card
        title={
          <Space>
            <DollarOutlined />
            <span>전체 자산 현황</span>
          </Space>
        }
        extra={<Tag color={totalPL >= 0 ? 'green' : 'red'}>
          {totalPL >= 0 ? '수익' : '손실'}
        </Tag>}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="총 자산"
              value={totalAssets}
              precision={2}
              prefix="$"
              valueStyle={{ color: '#1890ff', fontSize: 24, fontWeight: 'bold' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="총 손익"
              value={totalPL}
              precision={2}
              prefix={totalPL >= 0 ? '+$' : '-$'}
              valueStyle={{ color: totalPL >= 0 ? '#3f8600' : '#cf1322', fontSize: 24, fontWeight: 'bold' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="수익률"
              value={totalPLRate}
              precision={2}
              suffix="%"
              prefix={totalPL >= 0 ? <RiseOutlined /> : <FallOutlined />}
              valueStyle={{ color: totalPL >= 0 ? '#3f8600' : '#cf1322', fontSize: 24, fontWeight: 'bold' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="투자 비율"
              value={(totalInvested / initialCapital) * 100}
              precision={1}
              suffix="%"
              valueStyle={{ fontSize: 24 }}
            />
            <Progress
              percent={(totalInvested / initialCapital) * 100}
              size="small"
              strokeColor="#1890ff"
              showInfo={false}
            />
          </Col>
        </Row>
      </Card>

      {/* 보유 현황 */}
      <Card
        title={
          <Space>
            <WalletOutlined />
            <span>보유 현황</span>
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Statistic
              title="예수금"
              value={totalCash}
              precision={2}
              prefix="$"
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Statistic
              title="보유 주식"
              value={totalHoldings}
              suffix="주"
              valueStyle={{ color: '#1890ff' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              평가금액: ${totalValue.toFixed(2)}
            </Text>
          </Col>
          <Col xs={24} sm={8}>
            <Statistic
              title="평균 수익률"
              value={avgProfitRate}
              precision={2}
              suffix="%"
              prefix={avgProfitRate >= 0 ? <RiseOutlined /> : <FallOutlined />}
              valueStyle={{ color: avgProfitRate >= 0 ? '#3f8600' : '#cf1322' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              보유 중인 {holdingDivisions}개 분할 평균
            </Text>
          </Col>
        </Row>
      </Card>

      {/* 분할 사용 현황 */}
      <Card
        title={
          <Space>
            <StockOutlined />
            <span>분할 사용 현황</span>
          </Space>
        }
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 16 }}>
              <Space size="large">
                <div>
                  <div style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 4 }}>보유 중</div>
                  <div style={{ fontSize: 32, fontWeight: 'bold', color: '#1890ff' }}>
                    {holdingDivisions}
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>/ {divisions.length} 분할</div>
                </div>
                <div>
                  <div style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 4 }}>대기 중</div>
                  <div style={{ fontSize: 32, fontWeight: 'bold', color: '#52c41a' }}>
                    {emptyDivisions}
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>/ {divisions.length} 분할</div>
                </div>
              </Space>
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary">분할 사용률</Text>
            </div>
            <Progress
              percent={(holdingDivisions / divisions.length) * 100}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
              format={() => `${holdingDivisions} / ${divisions.length}`}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
              {emptyDivisions > 0
                ? `${emptyDivisions}개 분할이 매수 대기 중입니다`
                : '모든 분할이 사용 중입니다'}
            </Text>
          </Col>
        </Row>
      </Card>

      {/* 현재 시세 정보 */}
      <Card
        title="현재 시세"
        style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}
        headStyle={{ color: 'white', borderBottom: '1px solid rgba(255,255,255,0.2)' }}
      >
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, opacity: 0.9, marginBottom: 8 }}>SOXL 현재가</div>
              <div style={{ fontSize: 48, fontWeight: 'bold' }}>${currentPrice.toFixed(2)}</div>
            </div>
          </Col>
        </Row>
      </Card>
    </Space>
  );
};
