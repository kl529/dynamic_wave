'use client'

import React from 'react';
import { Card, Table, Tag, Progress, Tooltip } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, SafetyOutlined, ThunderboltOutlined } from '@ant-design/icons';

interface DivisionPortfolio {
  cash: number;
  holdings: number;
  avgPrice: number;
  buyDate: string | null;
  status: 'EMPTY' | 'HOLDING';
  mode: 'safe' | 'aggressive' | 'bull';
}

interface DivisionStatusPanelProps {
  divisionPortfolios: DivisionPortfolio[];
  todayClose: number;
  mode: 'safe' | 'aggressive' | 'bull' | 'auto';
}

export const DivisionStatusPanel: React.FC<DivisionStatusPanelProps> = ({
  divisionPortfolios,
  todayClose,
  mode
}) => {
  const columns = [
    {
      title: '분할',
      dataIndex: 'division',
      key: 'division',
      render: (text: number) => <strong>분할 {text}</strong>,
      width: 80
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag
          color={status === 'HOLDING' ? 'green' : 'default'}
          icon={status === 'HOLDING' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
        >
          {status === 'HOLDING' ? '보유중' : '비어있음'}
        </Tag>
      ),
      width: 120
    },
    {
      title: '보유량',
      dataIndex: 'holdings',
      key: 'holdings',
      render: (holdings: number) => holdings > 0 ? `${holdings}주` : '-',
      width: 100
    },
    {
      title: '평단가',
      dataIndex: 'avgPrice',
      key: 'avgPrice',
      render: (price: number) => price > 0 ? `$${price.toFixed(2)}` : '-',
      width: 100
    },
    {
      title: '매수 모드',
      dataIndex: 'mode',
      key: 'mode',
      render: (mode: 'safe' | 'aggressive' | 'bull' | undefined, record: any) => {
        if (record.status !== 'HOLDING') return '-';
        const buyMode = mode || 'safe';
        if (buyMode === 'bull') {
          return <Tag icon={<ThunderboltOutlined />} color="success">강세</Tag>;
        }
        return (
          <Tag
            icon={buyMode === 'safe' ? <SafetyOutlined /> : <ThunderboltOutlined />}
            color={buyMode === 'safe' ? 'success' : 'error'}
          >
            {buyMode === 'safe' ? '안전' : '공세'}
          </Tag>
        );
      },
      width: 100
    },
    {
      title: '매수일',
      dataIndex: 'buyDate',
      key: 'buyDate',
      render: (date: string | null) => date ? new Date(date).toLocaleDateString('ko-KR') : '-',
      width: 120
    },
    {
      title: '보유일수',
      key: 'holdingDays',
      render: (_: any, record: any) => {
        if (!record.buyDate) return '-';
        const holdingDays = Math.floor(
          (Date.now() - new Date(record.buyDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        const buyMode = record.mode || 'safe';
        const maxDays = buyMode === 'aggressive' ? 7 : buyMode === 'bull' ? 45 : 20;
        const percentage = (holdingDays / maxDays) * 100;
        const color = percentage > 80 ? 'red' : percentage > 50 ? 'orange' : 'green';

        return (
          <Tooltip title={`최대 ${maxDays}일 (${buyMode === 'safe' ? '안전' : buyMode === 'bull' ? '강세' : '공세'}모드)`}>
            <div>
              <div>{holdingDays}일 / {maxDays}일</div>
              <Progress
                percent={Math.min(percentage, 100)}
                size="small"
                status={percentage > 80 ? 'exception' : 'active'}
                strokeColor={color}
                showInfo={false}
              />
            </div>
          </Tooltip>
        );
      },
      width: 120
    },
    {
      title: '목표 수익률',
      key: 'targetProfit',
      render: (_: any, record: any) => {
        if (record.status !== 'HOLDING') return '-';
        const buyMode = record.mode || 'safe';
        const targetRate = buyMode === 'aggressive' ? 8.0 : buyMode === 'bull' ? 12.0 : 2.0;
        const currentRate = record.holdings > 0
          ? ((todayClose - record.avgPrice) / record.avgPrice) * 100
          : 0;
        const achieved = currentRate >= targetRate;

        return (
          <Tooltip title={`${buyMode === 'safe' ? '안전' : buyMode === 'bull' ? '강세' : '공세'}모드 목표`}>
            <Tag color={achieved ? 'green' : 'orange'}>
              {achieved ? '✓ ' : ''}{targetRate}%
            </Tag>
          </Tooltip>
        );
      },
      width: 110
    },
    {
      title: '현재 수익률',
      key: 'profitRate',
      render: (_: any, record: any) => {
        if (record.holdings === 0) return '-';
        const profitRate = ((todayClose - record.avgPrice) / record.avgPrice) * 100;
        return (
          <Tag color={profitRate >= 0 ? 'green' : 'red'}>
            {profitRate >= 0 ? '+' : ''}{profitRate.toFixed(2)}%
          </Tag>
        );
      },
      width: 120
    },
    {
      title: '평가손익',
      key: 'unrealizedPL',
      render: (_: any, record: any) => {
        if (record.holdings === 0) return '-';
        const pl = (todayClose - record.avgPrice) * record.holdings;
        return (
          <span style={{ color: pl >= 0 ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
            ${pl.toFixed(2)}
          </span>
        );
      },
      width: 120
    }
  ];

  const dataSource = divisionPortfolios.map((div, index) => ({
    key: index,
    division: index + 1,
    ...div
  }));

  return (
    <Card title="📊 5분할 상태 대시보드" style={{ marginBottom: 16 }}>
      <Table
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        size="middle"
        bordered
        scroll={{ x: 'max-content' }}
      />
    </Card>
  );
};
