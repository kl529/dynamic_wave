'use client'

import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Popconfirm, message, Space } from 'antd';
import { DeleteOutlined, CommentOutlined } from '@ant-design/icons';

interface TradeRecord {
  id: number;
  date: string;
  division: number;
  action: string;
  quantity: number;
  price: number;
  amount: number;
  comment: string;
  createdAt: string;
}

export const TradeRecordList: React.FC = () => {
  const [records, setRecords] = useState<TradeRecord[]>([]);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = () => {
    const data = JSON.parse(localStorage.getItem('tradeRecords') || '[]');
    setRecords(data.sort((a: TradeRecord, b: TradeRecord) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const handleDelete = (id: number) => {
    const updated = records.filter(r => r.id !== id);
    localStorage.setItem('tradeRecords', JSON.stringify(updated));
    setRecords(updated);
    message.success('기록이 삭제되었습니다');
  };

  const columns = [
    {
      title: '날짜',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      render: (date: string) => {
        const d = new Date(date);
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        return (
          <div>
            <div>{date}</div>
            <Tag color="blue">{weekdays[d.getDay()]}요일</Tag>
          </div>
        );
      }
    },
    {
      title: '분할',
      dataIndex: 'division',
      key: 'division',
      width: 80,
      render: (div: number) => <Tag color="purple">분할{div}</Tag>
    },
    {
      title: '매매',
      dataIndex: 'action',
      key: 'action',
      width: 80,
      render: (action: string) => (
        <Tag color={action === 'BUY' ? 'green' : 'red'}>
          {action === 'BUY' ? '매수' : '매도'}
        </Tag>
      )
    },
    {
      title: '수량',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      render: (qty: number) => `${qty}주`
    },
    {
      title: '가격',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (price: number) => `$${price.toFixed(2)}`
    },
    {
      title: '금액',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (amount: number) => <strong>${amount.toFixed(2)}</strong>
    },
    {
      title: '코멘트',
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
      render: (comment: string) => comment ? (
        <Space>
          <CommentOutlined />
          <span>{comment}</span>
        </Space>
      ) : '-'
    },
    {
      title: '작업',
      key: 'action',
      width: 80,
      render: (_: any, record: TradeRecord) => (
        <Popconfirm
          title="정말 삭제하시겠습니까?"
          onConfirm={() => handleDelete(record.id)}
          okText="삭제"
          cancelText="취소"
        >
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
          />
        </Popconfirm>
      )
    }
  ];

  return (
    <Card
      title="📜 매매 기록 내역"
      style={{ marginBottom: 16 }}
      extra={<span style={{ color: '#888' }}>총 {records.length}건</span>}
    >
      <Table
        dataSource={records}
        columns={columns}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `총 ${total}건`
        }}
        size="middle"
        bordered
        scroll={{ x: 'max-content' }}
        rowKey="id"
      />
    </Card>
  );
};
