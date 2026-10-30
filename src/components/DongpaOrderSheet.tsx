'use client'

import React from 'react';
import { Card, Empty, Tag } from 'antd';
import type { DongpaMode, DongpaOrder } from '@/lib/dongpaOrders';

interface DongpaOrderSheetProps {
  orders: DongpaOrder[];
  session: string;
  mode: DongpaMode;
}

const MODE_LABEL: Record<DongpaMode, { label: string; color: string }> = {
  safe: { label: '안전모드', color: 'green' },
  aggressive: { label: '공세모드', color: 'orange' },
  bull: { label: '강세모드', color: 'red' },
  cash: { label: '현금모드', color: 'default' },
};

/** 다음 정규장에 넣을 동파법 주문표 (장 마감 전 LOC/MOC 주문) */
export const DongpaOrderSheet: React.FC<DongpaOrderSheetProps> = ({ orders, session, mode }) => (
  <Card
    title={`${session} SOXL 주문`}
    extra={<Tag color={MODE_LABEL[mode].color} style={{ margin: 0 }}>{MODE_LABEL[mode].label}</Tag>}
    styles={{ body: { padding: orders.length ? '4px 16px' : 16 } }}
  >
    {orders.length === 0 ? (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="주문 없음" />
    ) : (
      orders.map((o, i) => (
        <div
          key={`${o.division}-${o.side}`}
          style={{ padding: '10px 0', borderTop: i ? '1px solid #f0f0f0' : undefined }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 44, color: '#595959' }}>분할 {o.division}</span>
            <Tag color={o.side === 'BUY' ? 'red' : 'blue'} style={{ margin: 0 }}>
              {o.side === 'BUY' ? '매수' : '매도'} {o.type}
            </Tag>
            <span style={{ fontWeight: 600 }}>{o.quantity}주</span>
            <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
              {o.limitPrice ? `$${o.limitPrice.toFixed(2)}` : '시장가'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4, paddingLeft: 52 }}>{o.reason}</div>
        </div>
      ))
    )}
  </Card>
);
