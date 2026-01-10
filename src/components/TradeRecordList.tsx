'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Button, Popconfirm, message, Space, Alert } from 'antd';
import { DeleteOutlined, CommentOutlined, CloudUploadOutlined, ReloadOutlined } from '@ant-design/icons';
import { TradeRecordService } from '@/services/supabaseService';
import { type TradeRecord } from '@/lib/supabase';

interface TradeRecordListProps {
  refreshTrigger?: number;
}

export const TradeRecordList: React.FC<TradeRecordListProps> = ({ refreshTrigger }) => {
  const [records, setRecords] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLocalData, setHasLocalData] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await TradeRecordService.getRecords();
      setRecords(data);
    } catch (error) {
      message.error('데이터 로딩 실패: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkLocalData = useCallback(() => {
    if (typeof window !== 'undefined') {
      const localData = localStorage.getItem('tradeRecords');
      setHasLocalData(!!localData && JSON.parse(localData).length > 0);
    }
  }, []);

  useEffect(() => {
    loadRecords();
    checkLocalData();
  }, [loadRecords, checkLocalData, refreshTrigger]);

  const handleDelete = async (id: number) => {
    try {
      await TradeRecordService.deleteRecord(id);
      setRecords(records.filter(r => r.id !== id));
      message.success('기록이 삭제되었습니다');
    } catch (error) {
      message.error('삭제 실패: ' + (error as Error).message);
    }
  };

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      const count = await TradeRecordService.migrateFromLocalStorage();
      message.success(`${count}건의 기록이 Supabase로 이전되었습니다`);
      setHasLocalData(false);
      loadRecords();
    } catch (error) {
      message.error('마이그레이션 실패: ' + (error as Error).message);
    } finally {
      setMigrating(false);
    }
  };

  const columns = [
    {
      title: '날짜',
      dataIndex: 'trade_date',
      key: 'trade_date',
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
      dataIndex: 'division_number',
      key: 'division_number',
      width: 80,
      render: (div: number) => <Tag color="purple">분할{div}</Tag>
    },
    {
      title: '매매',
      dataIndex: 'trade_type',
      key: 'trade_type',
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
          onConfirm={() => handleDelete(record.id!)}
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
      extra={
        <Space>
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={loadRecords}
            loading={loading}
          />
          <span style={{ color: '#888' }}>총 {records.length}건</span>
        </Space>
      }
    >
      {hasLocalData && (
        <Alert
          message="로컬 데이터 발견"
          description="브라우저에 저장된 기존 매매 기록이 있습니다. Supabase로 이전하시겠습니까?"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          action={
            <Button
              type="primary"
              size="small"
              icon={<CloudUploadOutlined />}
              loading={migrating}
              onClick={handleMigrate}
            >
              데이터 이전
            </Button>
          }
        />
      )}
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
        loading={loading}
      />
    </Card>
  );
};
