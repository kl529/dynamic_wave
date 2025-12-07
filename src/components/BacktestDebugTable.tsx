'use client'

import React from 'react';
import { Card, Table, Tag, Space, Button } from 'antd';
import { DownloadOutlined, TableOutlined } from '@ant-design/icons';
import type { DailyTradeRecord } from '@/types';

interface BacktestDebugTableProps {
  trades: DailyTradeRecord[];
  initialCapital: number;
}

const formatDateWithOffset = (date: string, offsetDays: number): string => {
  const base = new Date(date);
  if (Number.isNaN(base.getTime())) {
    return '-';
  }
  base.setDate(base.getDate() + offsetDays);
  return base.toISOString().split('T')[0];
};

interface DebugTableRow {
  key: string;
  거래일자: string;
  종가: number;
  매매모드: string;
  변동률: number;
  가용가능자금: number;
  매수목표: number;
  목표량: number;
  매수가: number;
  매수량: number;
  매수금액: number;
  목표가: number;
  최대보유만료일: string;
  실제매도일: string;
  매도가: number;
  매도량: number;
  매도금액: number;
  손익금액: number;
  손익률: number;
  누적손익: number;
  예수금: number;
  보유량: number;
  평가금: number;
  총자산: number;
  수익률: number;
  분할번호: number;
  isBuyAction: boolean;
  // 퉁치기 정보
  isFirstDivision: boolean;
  퉁치기여부: boolean;
  전체매수량: number;
  전체매도량: number;
  순매매량: number;
  실제거래: 'BUY' | 'SELL' | 'NONE';
  실제거래량: number;
  절약수수료: number;
}

export const BacktestDebugTable: React.FC<BacktestDebugTableProps> = ({
  trades,
  initialCapital
}) => {

  // 각 거래일의 각 분할을 개별 행으로 변환
  const debugData: DebugTableRow[] = [];

  const dateOrderMap = new Map<string, number>();
  let dateToggle = 0;

  trades.forEach((trade) => {
    // 각 분할별로 행 생성
    trade.divisionPortfolios.forEach((division, divIndex) => {
      // 해당 분할의 당일 액션 찾기
      const buyAction = trade.divisionActions.find(
        (a) => a.divisionNumber === division.divisionNumber && a.action === 'BUY'
      );
      const sellAction = trade.divisionActions.find(
        (a) =>
          a.divisionNumber === division.divisionNumber &&
          (a.action === 'SELL' || a.action === 'STOP_LOSS')
      );

      // 모드별 설정
      const modeConfig =
        trade.mode === 'safe'
          ? { sellTarget: 0.002, buyTarget: 0.03, holdingDays: 30 }
          : { sellTarget: 0.025, buyTarget: 0.05, holdingDays: 7 };

      // 가용자금 (현금)
      const 가용자금 = division.cash;

      // 매수 목표 (매수 지정가)
      const 기준종가 = trade.prevClosePrice || trade.closePrice;
      const 매수목표 = 기준종가 * (1 + modeConfig.buyTarget);

      // 목표량
      const 목표량 =
        division.status === 'EMPTY' ? Math.floor(가용자금 / 매수목표) : 0;

      // 매수 정보
      const 매수가 = buyAction ? buyAction.price : 0;
      const 매수량 = buyAction ? buyAction.quantity : 0;
      const 매수금액 = buyAction ? buyAction.amount : 0;

      // 매도 목표가
      const 목표가 = division.avgPrice > 0
        ? division.avgPrice * (1 + modeConfig.sellTarget)
        : 0;

      // 최대 보유 만료일은 최초 매수일 기준으로 고정
      const 최대보유만료일 =
        division.status === 'HOLDING' && division.buyDate
          ? formatDateWithOffset(division.buyDate, modeConfig.holdingDays)
          : '-';

      // 매도 정보
      const 실제매도일 = sellAction ? trade.date : '';
      const 매도가 = sellAction ? sellAction.price : 0;
      const 매도량 = sellAction ? sellAction.quantity : 0;
      const 매도금액 = sellAction ? sellAction.amount : 0;
      const 손익금액 = sellAction ? sellAction.profit || 0 : 0;
      const 손익률 = sellAction ? sellAction.profitRate || 0 : 0;

      // 누적 손익 (해당 날짜까지 전체 포트폴리오 손익)
      const 누적손익 = trade.totalAssets - initialCapital;

      // 예수금 (현금)
      const 예수금 = division.cash;

      // 보유량
      const 보유량 = division.holdings;

      // 평가금
      const 평가금 = division.currentValue;

      // 총자산 (전체 포트폴리오)
      const 총자산 = trade.totalAssets;

      // 수익률 (전체 포트폴리오)
      const 수익률 = trade.returnRate;

      if (!dateOrderMap.has(trade.date)) {
        dateOrderMap.set(trade.date, dateToggle % 2);
        dateToggle += 1;
      }

      debugData.push({
        key: `${trade.date}-${division.divisionNumber}`,
        거래일자: trade.date,
        종가: trade.closePrice,
        매매모드: trade.mode === 'safe' ? '안전' : '공세',
        변동률: trade.changeRate,
        가용가능자금: 가용자금,
        매수목표,
        목표량,
        매수가,
        매수량,
        매수금액,
        목표가,
        최대보유만료일,
        실제매도일,
        매도가,
        매도량,
        매도금액,
        손익금액,
        손익률,
        누적손익,
        예수금,
        보유량,
        평가금,
        총자산,
        수익률,
        분할번호: division.divisionNumber,
        isBuyAction: Boolean(buyAction),
        // 퉁치기 정보 (첫 번째 분할에만 표시)
        isFirstDivision: divIndex === 0,
        퉁치기여부: trade.isNetted,
        전체매수량: trade.totalBuyQuantity,
        전체매도량: trade.totalSellQuantity,
        순매매량: trade.netQuantity,
        실제거래: trade.actualTradeType,
        실제거래량: trade.actualTradeQuantity,
        절약수수료: trade.savedCommission
      });
    });
  });

  const dateColorMap = new Map<string, string>();
  debugData.forEach((row) => {
    if (!dateColorMap.has(row.거래일자)) {
      dateColorMap.set(
        row.거래일자,
        dateOrderMap.get(row.거래일자) === 0 ? 'date-band-even' : 'date-band-odd'
      );
    }
  });

  const columns = [
    {
      title: '거래일자',
      dataIndex: '거래일자',
      key: '거래일자',
      width: 110,
      fixed: 'left' as const,
      sorter: (a: DebugTableRow, b: DebugTableRow) =>
        new Date(a.거래일자).getTime() - new Date(b.거래일자).getTime()
    },
    {
      title: '분할',
      dataIndex: '분할번호',
      key: '분할번호',
      width: 70,
      fixed: 'left' as const,
      render: (val: number) => <Tag color="purple">{val}</Tag>
    },
    {
      title: '매매모드',
      dataIndex: '매매모드',
      key: '매매모드',
      width: 90,
      render: (text: string) => (
        <Tag color={text === '안전' ? 'green' : 'red'}>{text}</Tag>
      )
    },
    {
      title: '종가 (변동률)',
      dataIndex: '종가',
      key: '종가',
      width: 130,
      render: (_: number, row: DebugTableRow) => (
        <span>
          ${row.종가.toFixed(2)}{' '}
          <span style={{ color: row.변동률 >= 0 ? '#2f8f2f' : '#c40404' }}>
            ({row.변동률 >= 0 ? '+' : ''}{row.변동률.toFixed(2)}%)
          </span>
        </span>
      )
    },
    {
      title: '가용 가능 자금',
      dataIndex: '가용가능자금',
      key: '가용가능자금',
      width: 110,
      render: (val: number) => `$${val.toFixed(2)}`
    },
    {
      title: '매수목표',
      dataIndex: '매수목표',
      key: '매수목표',
      width: 110,
      render: (val: number) => (val > 0 ? `$${val.toFixed(2)}` : '-')
    },
    {
      title: '목표량',
      dataIndex: '목표량',
      key: '목표량',
      width: 90,
      render: (val: number) => (val > 0 ? `${val}주` : '-')
    },
    {
      title: '매수가',
      dataIndex: '매수가',
      key: '매수가',
      width: 100,
      render: (val: number) => (val > 0 ? `$${val.toFixed(2)}` : '-')
    },
    {
      title: '매수량',
      dataIndex: '매수량',
      key: '매수량',
      width: 90,
      render: (val: number) => (val > 0 ? `${val}주` : '-')
    },
    {
      title: '매수금액',
      dataIndex: '매수금액',
      key: '매수금액',
      width: 110,
      render: (val: number) => (val > 0 ? `$${val.toFixed(2)}` : '-')
    },
    {
      title: '목표가',
      dataIndex: '목표가',
      key: '목표가',
      width: 100,
      render: (val: number) => (val > 0 ? `$${val.toFixed(2)}` : '-')
    },
    {
      title: '최대보유 만료일',
      dataIndex: '최대보유만료일',
      key: '최대보유만료일',
      width: 140,
      render: (val: string) => val
    },
    {
      title: '실제매도일',
      dataIndex: '실제매도일',
      key: '실제매도일',
      width: 110,
      render: (val: string) => val || '-'
    },
    {
      title: '매도가',
      dataIndex: '매도가',
      key: '매도가',
      width: 100,
      render: (val: number) => (val > 0 ? `$${val.toFixed(2)}` : '-')
    },
    {
      title: '매도량',
      dataIndex: '매도량',
      key: '매도량',
      width: 90,
      render: (val: number) => (val > 0 ? `${val}주` : '-')
    },
    {
      title: '매도금액',
      dataIndex: '매도금액',
      key: '매도금액',
      width: 110,
      render: (val: number) => (val > 0 ? `$${val.toFixed(2)}` : '-')
    },
    {
      title: '손익금액',
      dataIndex: '손익금액',
      key: '손익금액',
      width: 110,
      render: (val: number) =>
        val !== 0 ? (
          <span style={{ color: val >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
            {val >= 0 ? '+' : ''}${val.toFixed(2)}
          </span>
        ) : (
          '-'
        )
    },
    {
      title: '손익률',
      dataIndex: '손익률',
      key: '손익률',
      width: 90,
      render: (val: number) =>
        val !== 0 ? (
          <span style={{ color: val >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
            {val >= 0 ? '+' : ''}
            {val.toFixed(2)}%
          </span>
        ) : (
          '-'
        )
    },
    {
      title: '누적손익',
      dataIndex: '누적손익',
      key: '누적손익',
      width: 110,
      render: (val: number) => (
        <span style={{ color: val >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
          {val >= 0 ? '+' : ''}${val.toFixed(2)}
        </span>
      )
    },
    {
      title: '예수금',
      dataIndex: '예수금',
      key: '예수금',
      width: 110,
      render: (val: number) => `$${val.toFixed(2)}`
    },
    {
      title: '보유량',
      dataIndex: '보유량',
      key: '보유량',
      width: 90,
      render: (val: number) => (val > 0 ? `${val}주` : '-')
    },
    {
      title: '평가금',
      dataIndex: '평가금',
      key: '평가금',
      width: 110,
      render: (val: number) => (val > 0 ? `$${val.toFixed(2)}` : '-')
    },
    {
      title: '총자산',
      dataIndex: '총자산',
      key: '총자산',
      width: 120,
      render: (val: number) => <strong>${val.toFixed(2)}</strong>
    },
    {
      title: '수익률',
      dataIndex: '수익률',
      key: '수익률',
      width: 100,
      render: (val: number) => (
        <span style={{ color: val >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
          {val >= 0 ? '+' : ''}
          {val.toFixed(2)}%
        </span>
      )
    },
    {
      title: '퉁치기',
      key: 'netting',
      width: 90,
      render: (_: any, row: DebugTableRow) => {
        if (!row.isFirstDivision) return null;
        return row.퉁치기여부 ? (
          <Tag color="gold">✓ 퉁</Tag>
        ) : (
          <Tag color="default">-</Tag>
        );
      }
    },
    {
      title: '매수/매도',
      key: 'buysel',
      width: 110,
      render: (_: any, row: DebugTableRow) => {
        if (!row.isFirstDivision) return null;
        return (
          <span style={{ fontSize: '12px' }}>
            {row.전체매수량 > 0 && <span style={{ color: '#1890ff' }}>↑{row.전체매수량}</span>}
            {row.전체매수량 > 0 && row.전체매도량 > 0 && ' / '}
            {row.전체매도량 > 0 && <span style={{ color: '#ff4d4f' }}>↓{row.전체매도량}</span>}
            {row.전체매수량 === 0 && row.전체매도량 === 0 && '-'}
          </span>
        );
      }
    },
    {
      title: '순매매',
      key: 'net',
      width: 110,
      render: (_: any, row: DebugTableRow) => {
        if (!row.isFirstDivision) return null;
        if (row.실제거래 === 'NONE') return '-';
        const color = row.실제거래 === 'BUY' ? '#1890ff' : '#ff4d4f';
        const icon = row.실제거래 === 'BUY' ? '↑' : '↓';
        return (
          <span style={{ color, fontWeight: 'bold' }}>
            {icon} {row.실제거래량}주
          </span>
        );
      }
    },
    {
      title: '절약수수료',
      dataIndex: '절약수수료',
      key: '절약수수료',
      width: 110,
      render: (val: number, row: DebugTableRow) => {
        if (!row.isFirstDivision) return null;
        return val > 0 ? (
          <span style={{ color: '#52c41a' }}>
            💰 ${val.toFixed(2)}
          </span>
        ) : (
          '-'
        );
      }
    }
  ];

  // CSV 다운로드 핸들러
  const handleDownloadCSV = () => {
    const headers = [
      '거래일자',
      '분할번호',
      '종가',
      '매매모드',
      '변동률(%)',
      '가용 가능 자금',
      '매수목표',
      '목표량',
      '매수가',
      '매수량',
      '매수금액',
      '목표가',
      '최대보유만료일',
      '실제매도일',
      '매도가',
      '매도량',
      '매도금액',
      '손익금액',
      '손익률(%)',
      '누적손익',
      '예수금',
      '보유량',
      '평가금',
      '총자산',
      '수익률(%)'
    ];

    const rows = debugData.map((row) => [
      row.거래일자,
      row.분할번호,
      row.종가.toFixed(2),
      row.매매모드,
      row.변동률.toFixed(2),
      row.가용가능자금.toFixed(2),
      row.매수목표.toFixed(2),
      row.목표량,
      row.매수가.toFixed(2),
      row.매수량,
      row.매수금액.toFixed(2),
      row.목표가.toFixed(2),
      row.최대보유만료일,
      row.실제매도일,
      row.매도가.toFixed(2),
      row.매도량,
      row.매도금액.toFixed(2),
      row.손익금액.toFixed(2),
      row.손익률.toFixed(2),
      row.누적손익.toFixed(2),
      row.예수금.toFixed(2),
      row.보유량,
      row.평가금.toFixed(2),
      row.총자산.toFixed(2),
      row.수익률.toFixed(2)
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join(
      '\n'
    );

    // BOM 추가 (한글 깨짐 방지)
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backtest_debug_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card
      title={
        <Space>
          <TableOutlined />
          <span>📊 분할별 상세 백테스팅 데이터</span>
        </Space>
      }
      extra={
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleDownloadCSV}
          size="small"
        >
          CSV 다운로드
        </Button>
      }
      style={{ marginTop: 24 }}
    >
      <div style={{ marginBottom: 16 }}>
        <Tag color="blue">총 거래일: {trades.length}일</Tag>
        <Tag color="purple">총 데이터: {debugData.length}행</Tag>
        <Tag color="gold">분할 수: 5개</Tag>
      </div>

      <Table
        dataSource={debugData}
        columns={columns}
        pagination={{
          pageSize: 50,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100', '200'],
          showTotal: (total) => `총 ${total}행`
        }}
        scroll={{ x: 3000, y: 600 }}
        size="small"
        bordered
        sticky
        className="backtest-debug-table"
        rowClassName={(record) =>
          [dateColorMap.get(record.거래일자) || '', record.isBuyAction ? 'buy-row' : '']
            .filter(Boolean)
            .join(' ')
        }
      />
      <style jsx global>{`
        .backtest-debug-table .ant-table-cell {
          padding: 2px 4px !important;
        }
        .backtest-debug-table .date-band-even td {
          background: #dbeafe;
        }
        .backtest-debug-table .date-band-odd td {
          background: #ffe4e6;
        }
        .backtest-debug-table .buy-row td {
          background: #fff8e1 !important;
          box-shadow: inset 4px 0 0 #facc15;
        }
        .backtest-debug-table .ant-table-tbody > tr.ant-table-row:hover > td,
        .backtest-debug-table .ant-table-cell-row-hover,
        .backtest-debug-table .ant-table-row:hover .ant-table-cell {
          background: inherit !important;
        }
      `}</style>
    </Card>
  );
};
