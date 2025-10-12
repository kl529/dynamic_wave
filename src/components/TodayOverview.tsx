'use client'

import React from 'react';
import { Card, Statistic, Row, Col, Tag, Space } from 'antd';
import { CalendarOutlined, DashboardOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

interface TodayOverviewProps {
  divisionPortfolios?: any[];
  yesterdayClose: number;
  todayClose: number;
}

export const TodayOverview: React.FC<TodayOverviewProps> = ({
  divisionPortfolios = [],
  yesterdayClose,
  todayClose
}) => {
  const today = new Date();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[today.getDay()];
  const dateStr = today.toLocaleDateString('ko-KR');

  // 분할 사용 현황 계산
  const holdingDivisions = divisionPortfolios.filter(d => d?.status === 'HOLDING').length;
  const totalDivisions = divisionPortfolios.length || 5;
  const emptyDivisions = totalDivisions - holdingDivisions;

  // 변화율 계산
  const change = todayClose - yesterdayClose;
  const changePercent = (change / yesterdayClose) * 100;

  // 총 자산 계산
  const totalCash = divisionPortfolios.reduce((sum, d) => sum + (d?.cash || 0), 0);
  const totalValue = divisionPortfolios.reduce(
    (sum, d) => sum + ((d?.holdings || 0) * todayClose),
    0
  );
  const totalAssets = totalCash + totalValue;

  return (
    <Card className="today-overview" style={{ marginBottom: 16 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={6}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space>
              <CalendarOutlined style={{ fontSize: 24, color: '#1890ff' }} />
              <div>
                <div style={{ fontSize: 24, fontWeight: 'bold' }}>
                  {weekday}요일
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {dateStr}
                </div>
              </div>
            </Space>
          </Space>
        </Col>

        <Col xs={12} sm={6}>
          <Statistic
            title="어제 종가"
            value={yesterdayClose}
            precision={2}
            prefix="$"
            valueStyle={{ fontSize: 20 }}
          />
        </Col>

        <Col xs={12} sm={6}>
          <Statistic
            title="오늘 종가"
            value={todayClose}
            precision={2}
            prefix="$"
            valueStyle={{
              fontSize: 20,
              color: change >= 0 ? '#3f8600' : '#cf1322'
            }}
            suffix={
              <span style={{ fontSize: 14, marginLeft: 8 }}>
                {change >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                {Math.abs(changePercent).toFixed(2)}%
              </span>
            }
          />
        </Col>

        <Col xs={24} sm={6}>
          <Statistic
            title="분할 사용 현황"
            value={holdingDivisions}
            suffix={`/ ${totalDivisions}`}
            valueStyle={{ color: holdingDivisions > (totalDivisions * 0.6) ? '#ff4d4f' : '#3f8600' }}
            prefix={<DashboardOutlined />}
          />
        </Col>
      </Row>

      <div style={{ marginTop: 16 }}>
        <Space wrap>
          <Tag color="blue">현금: ${totalCash.toFixed(2)}</Tag>
          <Tag color="green">평가액: ${totalValue.toFixed(2)}</Tag>
          <Tag color="gold">총 자산: ${totalAssets.toFixed(2)}</Tag>
          <Tag color={emptyDivisions < 2 ? 'red' : 'cyan'}>
            비어있는 분할: {emptyDivisions}개
          </Tag>
        </Space>
      </div>
    </Card>
  );
};
