'use client'

import React, { useState } from 'react';
import { Card, Table, Select, Button, Space, Statistic, Row, Col, Tag, Typography, Alert } from 'antd';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import {
  AreaChartOutlined,
  TableOutlined,
  ReloadOutlined,
  RiseOutlined,
  FallOutlined,
  MinusOutlined
} from '@ant-design/icons';
import { BacktestResult, Trade } from '@/types';

const { Title, Text } = Typography;
const { Option } = Select;

interface BacktestPanelProps {
  backtestResult: BacktestResult | null;
  onBacktest: (days: number) => void;
  loading: boolean;
}

export const BacktestPanel: React.FC<BacktestPanelProps> = ({
  backtestResult,
  onBacktest,
  loading
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState(90);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const handlePeriodChange = (days: number) => {
    setSelectedPeriod(days);
    onBacktest(days);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'BUY':
        return <RiseOutlined style={{ color: '#52c41a' }} />;
      case 'SELL':
        return <FallOutlined style={{ color: '#f5222d' }} />;
      default:
        return <MinusOutlined style={{ color: '#8c8c8c' }} />;
    }
  };

  const getActionTag = (action: string) => {
    const colors = { BUY: 'success', SELL: 'error', HOLD: 'default' };
    return <Tag color={colors[action as keyof typeof colors]}>{action}</Tag>;
  };

  // 테이블 컬럼 정의
  const columns = [
    {
      title: '날짜',
      dataIndex: 'date',
      key: 'date',
      width: 100,
      render: (date: string) => date.split('-').slice(1).join('/'),
    },
    {
      title: '주가',
      dataIndex: 'price',
      key: 'price',
      width: 80,
      render: (price: number) => `$${price.toFixed(2)}`,
    },
    {
      title: '변동률',
      dataIndex: 'change',
      key: 'change',
      width: 80,
      render: (change: number) => (
        <span style={{ color: change >= 0 ? '#3f8600' : '#cf1322' }}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      ),
    },
    {
      title: '신호',
      dataIndex: 'action',
      key: 'action',
      width: 80,
      render: (action: string) => (
        <Space>
          {getActionIcon(action)}
          {getActionTag(action)}
        </Space>
      ),
    },
    {
      title: '수량',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 60,
      render: (quantity: number) => quantity > 0 ? `${quantity}주` : '-',
    },
    {
      title: '금액',
      dataIndex: 'amount',
      key: 'amount',
      width: 90,
      render: (amount: number) => amount > 0 ? `$${amount.toLocaleString()}` : '-',
    },
    {
      title: '손익',
      dataIndex: 'profit',
      key: 'profit',
      width: 90,
      render: (profit: number) => (
        profit !== 0 ? (
          <span style={{ color: profit > 0 ? '#3f8600' : '#cf1322' }}>
            {profit > 0 ? '+' : ''}${profit.toFixed(2)}
          </span>
        ) : '-'
      ),
    },
    {
      title: '보유주식',
      dataIndex: 'holdings',
      key: 'holdings',
      width: 80,
      render: (holdings: number) => `${holdings}주`,
    },
    {
      title: '총자산',
      dataIndex: 'totalAssets',
      key: 'totalAssets',
      width: 100,
      render: (totalAssets: number) => `$${totalAssets.toLocaleString()}`,
    },
    {
      title: '수익률',
      dataIndex: 'returnRate',
      key: 'returnRate',
      width: 80,
      render: (returnRate: number) => (
        <span style={{ color: returnRate >= 0 ? '#3f8600' : '#cf1322' }}>
          {returnRate >= 0 ? '+' : ''}{returnRate.toFixed(2)}%
        </span>
      ),
    },
  ];

  // 차트 데이터 준비
  const chartData = backtestResult?.trades.map(trade => ({
    date: trade.date.split('-').slice(1).join('/'),
    totalAssets: trade.totalAssets,
    returnRate: trade.returnRate,
    action: trade.action,
    price: trade.price
  })) || [];

  return (
    <div>
      {/* 백테스팅 제어 패널 */}
      <Card 
        title={
          <Space>
            <AreaChartOutlined />
            <span>백테스팅 분석</span>
          </Space>
        }
        extra={
          <Space>
            <Select
              value={selectedPeriod}
              onChange={handlePeriodChange}
              style={{ width: 120 }}
            >
              <Option value={30}>1개월</Option>
              <Option value={60}>2개월</Option>
              <Option value={90}>3개월</Option>
              <Option value={180}>6개월</Option>
            </Select>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => onBacktest(selectedPeriod)}
              loading={loading}
            >
              새로고침
            </Button>
          </Space>
        }
      >
        {backtestResult ? (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* 성과 요약 */}
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Statistic
                  title="최종 수익률"
                  value={backtestResult.summary.finalReturn}
                  suffix="%"
                  precision={2}
                  prefix={backtestResult.summary.finalReturn >= 0 ? '+' : ''}
                  valueStyle={{
                    color: backtestResult.summary.finalReturn >= 0 ? '#3f8600' : '#cf1322',
                    fontSize: '20px',
                    fontWeight: 'bold'
                  }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="승률"
                  value={backtestResult.summary.winRate}
                  suffix="%"
                  precision={1}
                  valueStyle={{ fontSize: '18px' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="최대낙폭"
                  value={backtestResult.summary.maxDrawdown}
                  suffix="%"
                  precision={2}
                  valueStyle={{ 
                    color: '#cf1322',
                    fontSize: '18px' 
                  }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="총 거래횟수"
                  value={backtestResult.summary.totalTrades}
                  suffix="회"
                  valueStyle={{ fontSize: '18px' }}
                />
              </Col>
            </Row>

            {/* 추가 통계 */}
            <Row gutter={[16, 16]}>
              <Col xs={8} sm={4}>
                <Statistic
                  title="매수"
                  value={backtestResult.summary.buyTrades}
                  suffix="회"
                  valueStyle={{ color: '#52c41a', fontSize: '16px' }}
                />
              </Col>
              <Col xs={8} sm={4}>
                <Statistic
                  title="매도"
                  value={backtestResult.summary.sellTrades}
                  suffix="회"
                  valueStyle={{ color: '#f5222d', fontSize: '16px' }}
                />
              </Col>
              <Col xs={8} sm={4}>
                <Statistic
                  title="평균수익"
                  value={backtestResult.summary.avgWin}
                  prefix="$"
                  precision={2}
                  valueStyle={{ fontSize: '16px' }}
                />
              </Col>
              <Col xs={8} sm={4}>
                <Statistic
                  title="평균손실"
                  value={Math.abs(backtestResult.summary.avgLoss)}
                  prefix="-$"
                  precision={2}
                  valueStyle={{ fontSize: '16px' }}
                />
              </Col>
              <Col xs={8} sm={4}>
                <Statistic
                  title="총수수료"
                  value={backtestResult.summary.totalCommission}
                  prefix="$"
                  precision={2}
                  valueStyle={{ fontSize: '16px' }}
                />
              </Col>
              <Col xs={8} sm={4}>
                <Statistic
                  title="샤프비율"
                  value={backtestResult.summary.sharpeRatio}
                  precision={2}
                  valueStyle={{ fontSize: '16px' }}
                />
              </Col>
            </Row>
          </Space>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Text type="secondary">백테스팅 데이터를 불러오는 중...</Text>
          </div>
        )}
      </Card>

      {/* 차트 및 테이블 뷰 */}
      {backtestResult && (
        <Card
          title="상세 분석"
          style={{ marginTop: 16 }}
          extra={
            <Space>
              <Button
                type={viewMode === 'chart' ? 'primary' : 'default'}
                icon={<AreaChartOutlined />}
                onClick={() => setViewMode('chart')}
              >
                차트
              </Button>
              <Button
                type={viewMode === 'table' ? 'primary' : 'default'}
                icon={<TableOutlined />}
                onClick={() => setViewMode('table')}
              >
                테이블
              </Button>
            </Space>
          }
        >
          {viewMode === 'chart' ? (
            <div style={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    fontSize={12}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis 
                    yAxisId="left"
                    fontSize={12}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    fontSize={12}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                  />
                  <Tooltip 
                    formatter={(value: any, name: string) => [
                      name === 'totalAssets' ? `$${Number(value).toLocaleString()}` :
                      name === 'returnRate' ? `${Number(value).toFixed(2)}%` :
                      value,
                      name === 'totalAssets' ? '총 자산' :
                      name === 'returnRate' ? '수익률' : name
                    ]}
                    labelFormatter={(label) => `날짜: ${label}`}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="totalAssets" 
                    stroke="#1890ff" 
                    strokeWidth={2}
                    dot={false}
                    name="총 자산"
                    yAxisId="left"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="returnRate" 
                    stroke="#52c41a" 
                    strokeWidth={2}
                    dot={false}
                    name="수익률"
                    yAxisId="right"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Table
              columns={columns}
              dataSource={backtestResult.trades}
              scroll={{ x: 800 }}
              pagination={{
                pageSize: 20,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => 
                  `${range[0]}-${range[1]} / 총 ${total}건`
              }}
              size="small"
            />
          )}
        </Card>
      )}
    </div>
  );
};