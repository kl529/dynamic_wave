'use client'

import React, { useEffect, useState } from 'react';
import { Alert, Card, Col, InputNumber, Row, Skeleton, Table, Tag, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { STRATEGY, StrategySignal, todayOrder } from '@/lib/strategy';
import { nextTradingDay } from '@/lib/marketTime';

interface StrategySignalCardProps {
  signal: StrategySignal | null;
  tradePrice: number | null; // QLD 마지막 종가
  loading: boolean;
  error: string | null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1)}%`;
const UP = '#cf1322';
const DOWN = '#0958d9';
const STORAGE_KEY = 'strategyHolding';

export const StrategySignalCard: React.FC<StrategySignalCardProps> = ({ signal, tradePrice, loading, error }) => {
  const [holding, setHolding] = useState({ shares: 0, cash: 0 });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) setHolding(saved);
    } catch { /* 손상된 값은 무시 */ }
  }, []);

  const update = (patch: Partial<typeof holding>) => {
    const next = { ...holding, ...patch };
    setHolding(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  if (error) return <Alert type="error" showIcon message="시세를 불러오지 못했습니다" description={error} />;
  if (loading || !signal) return <Card><Skeleton active paragraph={{ rows: 6 }} /></Card>;

  const change = signal.target - signal.current;
  const action = change > 0 ? { label: '늘리기', color: 'red' } : change < 0 ? { label: '줄이기', color: 'blue' } : { label: '유지', color: 'default' };
  const session = nextTradingDay(signal.asOf);
  const order = tradePrice ? todayOrder(signal, tradePrice, holding.shares, holding.cash) : 0;
  const hasAccount = holding.shares > 0 || holding.cash > 0;

  return (
    <Card
      title={
        <span>
          {STRATEGY.name}{' '}
          <Tooltip
            title={
              <div>
                <div>^NDX 종가가 이동평균 {STRATEGY.periods.join('·')}일 중 몇 개 위에 있는지의 비율만큼 QLD를 보유하고 나머지는 현금으로 둡니다.</div>
                <div style={{ marginTop: 6 }}>1995~2026 검증: 세후 연 18.0%, 최대 낙폭 -77% (2000~2003년, 2014년 회복). 자세한 내용은 docs/STRATEGY.md</div>
              </div>
            }
          >
            <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
          </Tooltip>
        </span>
      }
      extra={<span style={{ fontSize: 12, color: '#8c8c8c' }}>{signal.asOf} 종가 기준</span>}
      styles={{ body: { padding: 16 } }}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={10}>
          <div style={{ fontSize: 13, color: '#595959' }}>{session} 종가에 맞출 QLD 비중</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 0 8px' }}>
            <span style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1 }}>{pct(signal.target)}</span>
            {change !== 0 && <span style={{ fontSize: 15, color: '#8c8c8c' }}>현재 {pct(signal.current)}</span>}
            <Tag color={action.color} style={{ marginLeft: 4 }}>{action.label}</Tag>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#595959' }}>
              QLD 보유 (주)
              <InputNumber min={0} value={holding.shares} onChange={v => update({ shares: v ?? 0 })} style={{ width: '100%' }} />
            </label>
            <label style={{ fontSize: 12, color: '#595959' }}>
              현금 (USD)
              <InputNumber min={0} value={holding.cash} onChange={v => update({ cash: v ?? 0 })} style={{ width: '100%' }} prefix="$" />
            </label>
          </div>
          {hasAccount && tradePrice && (
            <div style={{ marginTop: 10, fontSize: 15, fontWeight: 600 }}>
              {order === 0 ? '주문 없음' : (
                <span style={{ color: order > 0 ? UP : DOWN }}>
                  QLD {Math.abs(order)}주 {order > 0 ? '매수' : '매도'}
                  <span style={{ fontWeight: 400, color: '#8c8c8c', marginLeft: 6 }}>
                    약 ${Math.round(Math.abs(order) * tradePrice).toLocaleString('en-US')} · MOC
                  </span>
                </span>
              )}
            </div>
          )}
        </Col>

        <Col xs={24} md={14}>
          <Table
            size="small"
            pagination={false}
            rowKey="period"
            dataSource={signal.averages}
            title={() => <span style={{ fontSize: 12, color: '#595959' }}>^NDX {signal.close.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>}
            columns={[
              { title: '이동평균', dataIndex: 'period', render: (p: number) => `${p}일` },
              { title: '값', dataIndex: 'value', align: 'right', render: (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 }) },
              {
                title: '종가 차이', dataIndex: 'gapPct', align: 'right',
                render: (g: number) => <span style={{ color: g > 0 ? UP : DOWN, fontWeight: 600 }}>{signed(g)}</span>,
              },
            ]}
          />
        </Col>
      </Row>
    </Card>
  );
};
