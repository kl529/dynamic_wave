'use client'

import React from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Progress, Space, Divider, Empty } from 'antd';
import {
  TrophyOutlined,
  RiseOutlined,
  FallOutlined,
  DollarOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import type { DailyTradeRecord, DivisionAction } from '@/types';

interface BacktestStatsDashboardProps {
  trades: DailyTradeRecord[];
  initialCapital: number;
  config: {
    divisions: number;
    mode: 'safe' | 'aggressive' | 'auto';
    rebalancePeriod: number;
  };
}

export const BacktestStatsDashboard: React.FC<BacktestStatsDashboardProps> = ({
  trades,
  initialCapital,
  config
}) => {
  if (!trades || trades.length === 0) {
    return (
      <Card>
        <Empty description="백테스팅 결과가 없습니다" />
      </Card>
    );
  }

  // 전체 통계 계산
  const finalTrade = trades[trades.length - 1];
  const finalValue = finalTrade.totalAssets;
  const totalReturn = finalValue - initialCapital;
  const totalReturnRate = (totalReturn / initialCapital) * 100;

  // 모든 매매 액션 추출
  const allActions = trades.flatMap(t => t.divisionActions);
  const buyActions = allActions.filter(a => a.action === 'BUY');
  const sellActions = allActions.filter(a => a.action === 'SELL');
  const stopLossActions = allActions.filter(a => a.action === 'STOP_LOSS');

  // 승률 계산
  const profitableSells = sellActions.filter(a => (a.profit || 0) > 0);
  const winRate = sellActions.length > 0
    ? (profitableSells.length / sellActions.length) * 100
    : 0;

  // 평균 수익/손실
  const avgProfit = profitableSells.length > 0
    ? profitableSells.reduce((sum, a) => sum + (a.profit || 0), 0) / profitableSells.length
    : 0;

  const losingSells = sellActions.filter(a => (a.profit || 0) < 0);
  const avgLoss = losingSells.length > 0
    ? losingSells.reduce((sum, a) => sum + (a.profit || 0), 0) / losingSells.length
    : 0;

  // 총 수수료
  const totalCommission = allActions.reduce((sum, a) => sum + a.commission, 0);

  // MDD 계산
  let peak = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownDate = '';

  trades.forEach(trade => {
    if (trade.totalAssets > peak) {
      peak = trade.totalAssets;
    }
    const drawdown = ((peak - trade.totalAssets) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownDate = trade.date;
    }
  });

  // 재분할 이벤트
  const rebalanceEvents = trades.filter(t => t.isRebalanceDay);

  // 분할별 통계
  const divisionStats: Record<string, {
    trades: number;
    wins: number;
    losses: number;
    totalProfit: number;
    totalCommission: number;
  }> = {};

  allActions.forEach(action => {
    const key = action.divisionName;
    if (!divisionStats[key]) {
      divisionStats[key] = {
        trades: 0,
        wins: 0,
        losses: 0,
        totalProfit: 0,
        totalCommission: 0
      };
    }

    if (action.action === 'SELL' || action.action === 'STOP_LOSS') {
      divisionStats[key].trades++;
      const profit = action.profit || 0;
      divisionStats[key].totalProfit += profit;

      if (profit > 0) {
        divisionStats[key].wins++;
      } else {
        divisionStats[key].losses++;
      }
    }

    divisionStats[key].totalCommission += action.commission;
  });

  const divisionStatsArray = Object.entries(divisionStats).map(([name, stats]) => ({
    divisionName: name,
    trades: stats.trades,
    wins: stats.wins,
    losses: stats.losses,
    winRate: stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0,
    totalProfit: stats.totalProfit,
    totalCommission: stats.totalCommission,
    netProfit: stats.totalProfit - stats.totalCommission
  }));

  // 분할별 테이블 컬럼
  const divisionColumns = [
    {
      title: '분할',
      dataIndex: 'divisionName',
      key: 'divisionName',
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '총 매매',
      dataIndex: 'trades',
      key: 'trades',
      sorter: (a: any, b: any) => a.trades - b.trades
    },
    {
      title: '승',
      dataIndex: 'wins',
      key: 'wins',
      render: (wins: number) => <Tag color="green">{wins}</Tag>
    },
    {
      title: '패',
      dataIndex: 'losses',
      key: 'losses',
      render: (losses: number) => <Tag color="red">{losses}</Tag>
    },
    {
      title: '승률',
      dataIndex: 'winRate',
      key: 'winRate',
      render: (rate: number) => (
        <Space>
          <Progress
            type="circle"
            percent={rate}
            size={50}
            format={(percent) => `${percent?.toFixed(0)}%`}
            strokeColor={rate >= 50 ? '#52c41a' : '#ff4d4f'}
          />
        </Space>
      ),
      sorter: (a: any, b: any) => a.winRate - b.winRate
    },
    {
      title: '총 손익',
      dataIndex: 'totalProfit',
      key: 'totalProfit',
      render: (profit: number) => (
        <span style={{ color: profit >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
          {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
        </span>
      ),
      sorter: (a: any, b: any) => a.totalProfit - b.totalProfit
    },
    {
      title: '수수료',
      dataIndex: 'totalCommission',
      key: 'totalCommission',
      render: (commission: number) => <span>${commission.toFixed(2)}</span>
    },
    {
      title: '순손익',
      dataIndex: 'netProfit',
      key: 'netProfit',
      render: (profit: number) => (
        <span style={{ color: profit >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
          {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
        </span>
      ),
      sorter: (a: any, b: any) => a.netProfit - b.netProfit
    }
  ];

  const modeMeta: Record<'safe' | 'aggressive' | 'auto', { label: string; tagColor: string; holdInfo: string }> = {
    safe: {
      label: '안전모드',
      tagColor: 'blue',
      holdInfo: '안전모드: 30거래일'
    },
    aggressive: {
      label: '공세모드',
      tagColor: 'red',
      holdInfo: '공세모드: 7거래일'
    },
    auto: {
      label: 'RSI 자동모드',
      tagColor: 'gold',
      holdInfo: 'RSI 자동: 안전 30거래일 / 공세 7거래일'
    }
  } as const;
  const currentModeMeta = modeMeta[config.mode];

  // 퉁치기 효과 계산
  const nettingActions = allActions.filter(a => a.reason && a.reason.includes('퉁치기'));
  const nettingSavings = nettingActions.length * totalCommission / allActions.length; // 대략적 추정

  return (
    <div style={{ marginTop: 24 }}>
      <Row gutter={[16, 16]}>
        {/* 핵심 성과 지표 */}
        <Col xs={24}>
          <Card title="📊 핵심 성과 지표">
            <Row gutter={16}>
              <Col xs={12} sm={8} md={6} lg={4}>
                <Statistic
                  title="최종 자산"
                  value={finalValue}
                  prefix={<DollarOutlined />}
                  precision={2}
                  valueStyle={{ color: totalReturn >= 0 ? '#3f8600' : '#cf1322' }}
                />
              </Col>
              <Col xs={12} sm={8} md={6} lg={4}>
                <Statistic
                  title="총 수익"
                  value={totalReturn}
                  prefix={totalReturn >= 0 ? <RiseOutlined /> : <FallOutlined />}
                  precision={2}
                  valueStyle={{ color: totalReturn >= 0 ? '#3f8600' : '#cf1322' }}
                  suffix="$"
                />
              </Col>
              <Col xs={12} sm={8} md={6} lg={4}>
                <Statistic
                  title="수익률"
                  value={totalReturnRate}
                  prefix={totalReturnRate >= 0 ? <RiseOutlined /> : <FallOutlined />}
                  precision={2}
                  valueStyle={{ color: totalReturnRate >= 0 ? '#3f8600' : '#cf1322' }}
                  suffix="%"
                />
              </Col>
              <Col xs={12} sm={8} md={6} lg={4}>
                <Statistic
                  title="MDD"
                  value={maxDrawdown}
                  prefix={<FallOutlined />}
                  precision={2}
                  valueStyle={{ color: '#cf1322' }}
                  suffix="%"
                />
              </Col>
              <Col xs={12} sm={8} md={6} lg={4}>
                <Statistic
                  title="승률"
                  value={winRate}
                  prefix={<TrophyOutlined />}
                  precision={1}
                  valueStyle={{ color: winRate >= 50 ? '#3f8600' : '#ff7a45' }}
                  suffix="%"
                />
              </Col>
              <Col xs={12} sm={8} md={6} lg={4}>
                <Statistic
                  title="총 매매"
                  value={allActions.length}
                  prefix={<LineChartOutlined />}
                />
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 매매 통계 */}
        <Col xs={24} lg={12}>
          <Card title="📈 매매 통계">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="매수"
                    value={buyActions.length}
                    valueStyle={{ color: '#52c41a' }}
                    prefix={<CheckCircleOutlined />}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="매도"
                    value={sellActions.length}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="손절"
                    value={stopLossActions.length}
                    valueStyle={{ color: '#ff4d4f' }}
                    prefix={<WarningOutlined />}
                  />
                </Col>
              </Row>

              <Divider style={{ margin: '12px 0' }} />

              <Row gutter={16}>
                <Col span={12}>
                  <div style={{ marginBottom: 8, color: '#666' }}>승리 매매</div>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#52c41a' }}>
                    {profitableSells.length}회
                  </div>
                  <div style={{ fontSize: 14, color: '#888' }}>
                    평균: ${avgProfit.toFixed(2)}
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ marginBottom: 8, color: '#666' }}>손실 매매</div>
                  <div style={{ fontSize: 20, fontWeight: 'bold', color: '#ff4d4f' }}>
                    {losingSells.length}회
                  </div>
                  <div style={{ fontSize: 14, color: '#888' }}>
                    평균: ${avgLoss.toFixed(2)}
                  </div>
                </Col>
              </Row>

              <Divider style={{ margin: '12px 0' }} />

              <div>
                <div style={{ marginBottom: 8, color: '#666' }}>손익비 (R-Multiple)</div>
                <div style={{ fontSize: 20, fontWeight: 'bold' }}>
                  {avgLoss !== 0 ? (avgProfit / Math.abs(avgLoss)).toFixed(2) : 'N/A'}
                </div>
              </div>
            </Space>
          </Card>
        </Col>

        {/* 비용 및 최적화 */}
        <Col xs={24} lg={12}>
          <Card title="💰 비용 및 최적화">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Statistic
                title="총 수수료"
                value={totalCommission}
                prefix={<DollarOutlined />}
                precision={2}
                valueStyle={{ color: '#ff7a45' }}
              />

              <Divider style={{ margin: '12px 0' }} />

              <div>
                <div style={{ marginBottom: 8 }}>
                  <Tag color="purple" icon={<ThunderboltOutlined />}>
                    퉁치기 최적화
                  </Tag>
                </div>
                <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
                  퉁치기 적용: {nettingActions.length}회
                </div>
                <div style={{ fontSize: 14, color: '#52c41a' }}>
                  추정 절감액: ${nettingSavings.toFixed(2)}
                </div>
              </div>

              <Divider style={{ margin: '12px 0' }} />

              <div>
                <div style={{ marginBottom: 8, color: '#666' }}>재분할 이벤트</div>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff' }}>
                  {rebalanceEvents.length}회
                </div>
                <div style={{ fontSize: 14, color: '#888' }}>
                  주기: {config.rebalancePeriod}거래일마다
                </div>
              </div>

              <Divider style={{ margin: '12px 0' }} />

              <div>
                <div style={{ marginBottom: 8, color: '#666' }}>손절 비율</div>
                <Progress
                  percent={sellActions.length > 0 ? (stopLossActions.length / sellActions.length) * 100 : 0}
                  strokeColor="#ff4d4f"
                  format={(percent) => `${percent?.toFixed(1)}%`}
                />
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                  {currentModeMeta.holdInfo}
                </div>
              </div>
            </Space>
          </Card>
        </Col>

        {/* 분할별 성과 */}
        <Col xs={24}>
          <Card title="🎯 분할별 성과">
            <Table
              dataSource={divisionStatsArray}
              columns={divisionColumns}
              pagination={false}
              bordered
              size="middle"
              rowKey="divisionName"
            />
          </Card>
        </Col>

        {/* 백테스팅 설정 요약 */}
        <Col xs={24}>
          <Card title="⚙️ 백테스팅 설정">
            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <div style={{ marginBottom: 8, color: '#666' }}>초기 자본</div>
                <div style={{ fontSize: 18, fontWeight: 'bold' }}>
                  ${initialCapital.toLocaleString()}
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div style={{ marginBottom: 8, color: '#666' }}>분할 수</div>
                <div style={{ fontSize: 18, fontWeight: 'bold' }}>
                  {config.divisions}개
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div style={{ marginBottom: 8, color: '#666' }}>매매 모드</div>
                <div>
                  <Tag color={currentModeMeta.tagColor}>
                    {currentModeMeta.label}
                  </Tag>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div style={{ marginBottom: 8, color: '#666' }}>재분할 주기</div>
                <div style={{ fontSize: 18, fontWeight: 'bold' }}>
                  {config.rebalancePeriod}거래일
                </div>
              </Col>
            </Row>

            <Divider style={{ margin: '16px 0' }} />

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <div style={{ marginBottom: 8, color: '#666' }}>기간</div>
                <div style={{ fontSize: 14 }}>
                  {trades[0].date} ~ {trades[trades.length - 1].date}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                  총 {trades.length}거래일
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <div style={{ marginBottom: 8, color: '#666' }}>최대 낙폭 발생일</div>
                <div style={{ fontSize: 14 }}>
                  {maxDrawdownDate}
                </div>
                <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>
                  -{maxDrawdown.toFixed(2)}%
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
