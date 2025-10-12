'use client'

import React, { useState, useMemo } from 'react';
import { Table, Card, Tag, Statistic, Row, Col, Button, Space, Tooltip } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, DollarOutlined } from '@ant-design/icons';
import { DongpaTrade } from '@/types';

interface DongpaTradeTableProps {
  trades: DongpaTrade[];
  loading?: boolean;
}

export const DongpaTradeTable: React.FC<DongpaTradeTableProps> = ({ 
  trades, 
  loading = false 
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 최근 거래 기록 (최신 30개)
  const recentTrades = useMemo(() => {
    return trades.slice(-30).reverse();
  }, [trades]);

  // 요약 통계
  const summary = useMemo(() => {
    if (!trades.length) return null;
    
    const lastTrade = trades[trades.length - 1];
    const buyTrades = trades.filter(t => t.매수량 > 0);
    const sellTrades = trades.filter(t => t.매도량 > 0);
    const profitableTrades = sellTrades.filter(t => t.당일실현손익금액 > 0);
    
    return {
      totalTrades: buyTrades.length + sellTrades.length,
      buyCount: buyTrades.length,
      sellCount: sellTrades.length,
      winRate: sellTrades.length > 0 ? (profitableTrades.length / sellTrades.length * 100) : 0,
      totalReturn: lastTrade.수익률,
      totalAssets: lastTrade.총자산,
      maxDrawdown: Math.max(...trades.map(t => t.DD)),
      totalProfit: trades.reduce((sum, t) => sum + t.당일실현손익금액, 0),
      currentCash: lastTrade.예수금,
      currentHoldings: lastTrade.보유량,
      avgPrice: lastTrade.평단가,
      accumulatedProfit: lastTrade.누적손익
    };
  }, [trades]);

  const columns = [
    {
      title: '거래일자',
      dataIndex: '거래일자',
      key: '거래일자',
      width: 100,
      render: (date: string) => (
        <span className="text-sm font-mono">
          {new Date(date).toLocaleDateString('ko-KR', {
            month: '2-digit',
            day: '2-digit'
          })}
        </span>
      )
    },
    {
      title: '종가',
      dataIndex: '종가',
      key: '종가',
      width: 80,
      render: (price: number) => (
        <span className="font-mono">${price.toFixed(2)}</span>
      )
    },
    {
      title: '변동률',
      dataIndex: '변동률',
      key: '변동률',
      width: 80,
      render: (change: number) => (
        <Tag color={change >= 0 ? 'green' : 'red'} className="font-mono">
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </Tag>
      )
    },
    {
      title: '매수',
      children: [
        {
          title: '수량',
          dataIndex: '매수량',
          key: '매수량',
          width: 60,
          render: (qty: number) => qty > 0 ? (
            <Tag color="blue" className="font-mono">{qty}</Tag>
          ) : '-'
        },
        {
          title: '가격',
          dataIndex: '매수가',
          key: '매수가',
          width: 70,
          render: (price: number) => price > 0 ? (
            <span className="font-mono text-blue-600">${price.toFixed(2)}</span>
          ) : '-'
        },
        {
          title: '금액',
          dataIndex: '매수금액',
          key: '매수금액',
          width: 80,
          render: (amount: number) => amount > 0 ? (
            <span className="font-mono text-blue-600">${amount.toFixed(0)}</span>
          ) : '-'
        }
      ]
    },
    {
      title: '매도',
      children: [
        {
          title: '수량',
          dataIndex: '매도량',
          key: '매도량',
          width: 60,
          render: (qty: number) => qty > 0 ? (
            <Tag color="red" className="font-mono">{qty}</Tag>
          ) : '-'
        },
        {
          title: '가격',
          dataIndex: '매도가',
          key: '매도가',
          width: 70,
          render: (price: number) => price > 0 ? (
            <span className="font-mono text-red-600">${price.toFixed(2)}</span>
          ) : '-'
        },
        {
          title: '손익',
          dataIndex: '당일실현손익금액',
          key: '당일실현손익금액',
          width: 80,
          render: (profit: number) => profit !== 0 ? (
            <Tag color={profit > 0 ? 'green' : 'red'} className="font-mono">
              ${profit.toFixed(0)}
            </Tag>
          ) : '-'
        }
      ]
    },
    {
      title: '포트폴리오',
      children: [
        {
          title: '예수금',
          dataIndex: '예수금',
          key: '예수금',
          width: 80,
          render: (cash: number) => (
            <span className="font-mono text-green-600">${cash.toFixed(0)}</span>
          )
        },
        {
          title: '보유량',
          dataIndex: '보유량',
          key: '보유량',
          width: 60,
          render: (holdings: number) => (
            <span className="font-mono">{holdings}</span>
          )
        },
        {
          title: '평단가',
          dataIndex: '평단가',
          key: '평단가',
          width: 70,
          render: (avgPrice: number) => avgPrice > 0 ? (
            <span className="font-mono">${avgPrice.toFixed(2)}</span>
          ) : '-'
        }
      ]
    },
    {
      title: '총자산',
      dataIndex: '총자산',
      key: '총자산',
      width: 90,
      render: (assets: number) => (
        <span className="font-mono font-semibold">${assets.toFixed(0)}</span>
      )
    },
    {
      title: '수익률',
      dataIndex: '수익률',
      key: '수익률',
      width: 80,
      render: (returnRate: number) => (
        <Tag 
          color={returnRate >= 0 ? 'green' : 'red'} 
          className="font-mono font-semibold"
        >
          {returnRate >= 0 ? '+' : ''}{returnRate.toFixed(2)}%
        </Tag>
      )
    },
    {
      title: 'DD',
      dataIndex: 'DD',
      key: 'DD',
      width: 70,
      render: (dd: number) => (
        <Tag color={dd > 20 ? 'red' : dd > 10 ? 'orange' : 'green'} className="font-mono">
          {dd.toFixed(1)}%
        </Tag>
      )
    }
  ];

  if (!trades.length) {
    return (
      <Card>
        <div className="text-center py-8 text-gray-500">
          거래 데이터가 없습니다.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 요약 통계 */}
      {summary && (
        <Card title="📊 거래 요약" size="small">
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={6}>
              <Statistic
                title="총 거래"
                value={summary.totalTrades}
                suffix="회"
                valueStyle={{ fontSize: '18px' }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="승률"
                value={summary.winRate}
                suffix="%"
                precision={1}
                valueStyle={{ 
                  fontSize: '18px',
                  color: summary.winRate >= 50 ? '#52c41a' : '#f5222d'
                }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="총 수익률"
                value={summary.totalReturn}
                suffix="%"
                precision={2}
                prefix={summary.totalReturn >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                valueStyle={{ 
                  fontSize: '18px',
                  color: summary.totalReturn >= 0 ? '#52c41a' : '#f5222d'
                }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="MDD"
                value={summary.maxDrawdown}
                suffix="%"
                precision={1}
                valueStyle={{ 
                  fontSize: '18px',
                  color: summary.maxDrawdown > 20 ? '#f5222d' : summary.maxDrawdown > 10 ? '#fa8c16' : '#52c41a'
                }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="총자산"
                value={summary.totalAssets}
                prefix={<DollarOutlined />}
                precision={0}
                valueStyle={{ fontSize: '18px' }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="예수금"
                value={summary.currentCash}
                prefix={<DollarOutlined />}
                precision={0}
                valueStyle={{ fontSize: '18px', color: '#52c41a' }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="보유량"
                value={summary.currentHoldings}
                suffix="주"
                valueStyle={{ fontSize: '18px' }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="평단가"
                value={summary.avgPrice}
                prefix={<DollarOutlined />}
                precision={2}
                valueStyle={{ fontSize: '18px' }}
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* 거래 내역 테이블 */}
      <Card 
        title="📈 일자별 거래 내역" 
        size="small"
        extra={
          <Space>
            <span className="text-sm text-gray-500">
              최근 {recentTrades.length}건
            </span>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={recentTrades.map((trade, index) => ({
            ...trade,
            key: `${trade.거래일자}-${index}`
          }))}
          loading={loading}
          size="small"
          scroll={{ x: 1400, y: 500 }}
          pagination={{
            current: currentPage,
            pageSize,
            total: recentTrades.length,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} / ${total}건`,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size || 20);
            }
          }}
          className="dongpa-trade-table"
        />
      </Card>
    </div>
  );
};