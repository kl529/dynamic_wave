'use client'

import React from 'react';
import { Card, Row, Col, Empty, Spin } from 'antd';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import type { DailyTradeRecord } from '@/types';

interface BacktestResultsChartProps {
  trades: DailyTradeRecord[];
  loading?: boolean;
  initialCapital: number;
}

export const BacktestResultsChart: React.FC<BacktestResultsChartProps> = ({
  trades,
  loading = false,
  initialCapital
}) => {
  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#888' }}>백테스팅 실행 중...</div>
        </div>
      </Card>
    );
  }

  if (!trades || trades.length === 0) {
    return (
      <Card>
        <Empty
          description="백테스팅 결과가 없습니다. 설정을 완료하고 백테스팅을 시작하세요."
          style={{ padding: '60px 0' }}
        />
      </Card>
    );
  }

  // 차트 데이터 준비
  const equityData = trades.map((trade, index) => ({
    date: new Date(trade.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
    fullDate: trade.date,
    총자산: Number(trade.totalAssets.toFixed(2)),
    수익률: Number(trade.returnRate.toFixed(2)),
    현금: Number(trade.totalCash.toFixed(2)),
    평가금액: Number(trade.totalValue.toFixed(2)),
    초기자본: initialCapital
  }));

  // MDD 차트 데이터
  const drawdownData = trades.map(trade => ({
    date: new Date(trade.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
    fullDate: trade.date,
    낙폭: -Math.abs(trade.returnRate < 0 ? trade.returnRate : 0)
  }));

  // 재분할 이벤트 데이터
  const rebalanceEvents = trades
    .filter(trade => trade.isRebalanceDay)
    .map(trade => ({
      date: trade.date,
      displayDate: new Date(trade.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      totalAssets: trade.totalAssets,
      rebalanceAmount: trade.rebalanceAmount || 0
    }));

  // 매매 활동 차트 데이터
  const activityData = trades
    .filter(trade => trade.divisionActions.length > 0)
    .map(trade => {
      const buyActions = trade.divisionActions.filter(a => a.action === 'BUY');
      const sellActions = trade.divisionActions.filter(a => a.action === 'SELL' || a.action === 'STOP_LOSS');

      return {
        date: new Date(trade.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
        fullDate: trade.date,
        매수: buyActions.reduce((sum, a) => sum + a.quantity, 0),
        매도: sellActions.reduce((sum, a) => sum + a.quantity, 0),
        순매수: trade.netQuantity
      };
    });

  // 일별 손익 차트 데이터
  const dailyPLData = trades
    .filter(trade => trade.dailyRealizedPL !== 0)
    .map(trade => ({
      date: new Date(trade.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      fullDate: trade.date,
      손익: Number(trade.dailyRealizedPL.toFixed(2))
    }));

  // 커스텀 툴팁
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.96)',
            border: '1px solid #d9d9d9',
            borderRadius: 8,
            padding: '12px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
          }}
        >
          <p style={{ margin: 0, fontWeight: 'bold', marginBottom: 8 }}>{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ margin: '4px 0', color: entry.color }}>
              {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
              {entry.name.includes('률') ? '%' : entry.name.includes('손익') ? '' : ''}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ marginTop: 24 }}>
      <Row gutter={[16, 16]}>
        {/* 자산 추이 차트 */}
        <Col span={24}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={20} />
                <span>포트폴리오 자산 추이</span>
              </div>
            }
            style={{ height: '100%' }}
          >
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={equityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  style={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  style={{ fontSize: 12 }}
                  tickFormatter={(value) => `$${value.toLocaleString()}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine
                  y={initialCapital}
                  stroke="#ff4d4f"
                  strokeDasharray="5 5"
                  label={{ value: '초기자본', position: 'right', fill: '#ff4d4f' }}
                />
                <Area
                  type="monotone"
                  dataKey="총자산"
                  stroke="#1890ff"
                  fill="#1890ff"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="평가금액"
                  stroke="#52c41a"
                  fill="#52c41a"
                  fillOpacity={0.2}
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="현금"
                  stroke="#faad14"
                  fill="#faad14"
                  fillOpacity={0.2}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* 재분할 이벤트 표시 */}
            {rebalanceEvents.length > 0 && (
              <div style={{ marginTop: 16, padding: 12, background: '#f0f5ff', borderRadius: 8 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#1890ff' }}>
                  🔄 재분할 이벤트 ({rebalanceEvents.length}회)
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {rebalanceEvents.slice(0, 5).map((event, idx) => (
                    <span key={idx} style={{ marginRight: 16 }}>
                      {event.displayDate} (분할금액: ${event.rebalanceAmount.toFixed(2)})
                    </span>
                  ))}
                  {rebalanceEvents.length > 5 && <span>... 외 {rebalanceEvents.length - 5}회</span>}
                </div>
              </div>
            )}
          </Card>
        </Col>

        {/* 수익률 차트 */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={20} />
                <span>누적 수익률</span>
              </div>
            }
            style={{ height: '100%' }}
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={equityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  style={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  style={{ fontSize: 12 }}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine y={0} stroke="#d9d9d9" />
                <Line
                  type="monotone"
                  dataKey="수익률"
                  stroke="#52c41a"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        {/* 낙폭 차트 */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingDown size={20} />
                <span>Drawdown (낙폭)</span>
              </div>
            }
            style={{ height: '100%' }}
          >
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={drawdownData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  style={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  style={{ fontSize: 12 }}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine y={0} stroke="#d9d9d9" />
                <Area
                  type="monotone"
                  dataKey="낙폭"
                  stroke="#ff4d4f"
                  fill="#ff4d4f"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        {/* 매매 활동 차트 */}
        {activityData.length > 0 && (
          <Col xs={24} lg={12}>
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={20} />
                  <span>매매 활동</span>
                </div>
              }
              style={{ height: '100%' }}
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={activityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    style={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis style={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="매수" fill="#52c41a" />
                  <Bar dataKey="매도" fill="#ff4d4f" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        )}

        {/* 일별 손익 차트 */}
        {dailyPLData.length > 0 && (
          <Col xs={24} lg={12}>
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={20} />
                  <span>일별 실현손익</span>
                </div>
              }
              style={{ height: '100%' }}
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyPLData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    style={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    style={{ fontSize: 12 }}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <ReferenceLine y={0} stroke="#d9d9d9" />
                  <Bar
                    dataKey="손익"
                    fill="#1890ff"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
};
