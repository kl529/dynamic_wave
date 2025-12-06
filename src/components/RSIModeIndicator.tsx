'use client'

import React from 'react';
import { Card, Tag, Space, Typography, Progress, Tooltip, Alert } from 'antd';
import {
  RiseOutlined,
  FallOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';

const { Text, Title } = Typography;

interface RSIModeIndicatorProps {
  mode: 'safe' | 'aggressive';
  rsi: number | null;
  prevRSI: number | null;
  reason: string;
  signalStrength?: {
    strength: number;
    label: string;
    color: string;
  };
  lastUpdateDate?: string; // 마지막 업데이트 날짜 (YYYY-MM-DD 형식)
}

export const RSIModeIndicator: React.FC<RSIModeIndicatorProps> = ({
  mode,
  rsi,
  prevRSI,
  reason,
  signalStrength,
  lastUpdateDate
}) => {
  // 마지막 업데이트 시간 포맷팅
  const formatUpdateDate = (dateStr?: string) => {
    if (!dateStr) {
      return new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    const date = new Date(dateStr);
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[date.getDay()];

    return `${date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })} (${weekday})`;
  };

  const lastUpdate = formatUpdateDate(lastUpdateDate);
  const modeInfo = {
    safe: {
      name: '안전모드',
      color: 'blue',
      icon: '🛡️',
      description: '3% 하락시 매수, 0.2% 수익시 매도',
      risk: '중간',
      expectedReturn: '연 15-25%',
      bgColor: '#e6f7ff',
      borderColor: '#1890ff'
    },
    aggressive: {
      name: '공세모드',
      color: 'red',
      icon: '⚡',
      description: '5% 하락시 매수, 2.5% 수익시 매도',
      risk: '높음',
      expectedReturn: '연 30-50%',
      bgColor: '#fff1f0',
      borderColor: '#ff4d4f'
    }
  };

  const currentModeInfo = modeInfo[mode];
  const isRising = rsi && prevRSI && rsi > prevRSI;
  const isFalling = rsi && prevRSI && rsi < prevRSI;
  const rsiChange = rsi && prevRSI ? (rsi - prevRSI).toFixed(2) : '0.00';

  return (
    <Card
      style={{
        background: currentModeInfo.bgColor,
        border: `2px solid ${currentModeInfo.borderColor}`,
        borderRadius: 8
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* 모드 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <span style={{ fontSize: 24 }}>{currentModeInfo.icon}</span>
            <div>
              <Title level={4} style={{ margin: 0 }}>
                {currentModeInfo.name}
                <Tooltip title="RSI 지표에 따라 자동으로 결정됩니다">
                  <InfoCircleOutlined style={{ marginLeft: 8, fontSize: 14, color: '#8c8c8c' }} />
                </Tooltip>
              </Title>
              <Space direction="vertical" size={2} style={{ marginTop: 4 }}>
                <Tag color={currentModeInfo.color}>
                  RSI 기반 자동 설정
                </Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  📅 업데이트: {lastUpdate}
                </Text>
              </Space>
            </div>
          </Space>
          <ThunderboltOutlined style={{ fontSize: 32, color: currentModeInfo.borderColor }} />
        </div>

        {/* RSI 정보 */}
        {rsi !== null && (
          <div>
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong>현재 RSI</Text>
                <Space>
                  <Text style={{ fontSize: 20, fontWeight: 'bold' }}>
                    {rsi.toFixed(1)}
                  </Text>
                  {prevRSI && (
                    <Tag
                      color={isRising ? 'green' : isFalling ? 'red' : 'default'}
                      icon={isRising ? <RiseOutlined /> : isFalling ? <FallOutlined /> : null}
                    >
                      {isRising ? '+' : ''}{rsiChange}
                    </Tag>
                  )}
                </Space>
              </div>

              {/* RSI 진행바 */}
              <Progress
                percent={(rsi / 100) * 100}
                strokeColor={{
                  '0%': '#52c41a',
                  '30%': '#73d13d',
                  '50%': '#1890ff',
                  '70%': '#ffa940',
                  '100%': '#ff4d4f'
                }}
                format={() => ''}
                style={{ marginBottom: 4 }}
              />

              {/* RSI 레벨 표시 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <Text type="secondary">과매도 (30)</Text>
                <Text type="secondary">중립 (50)</Text>
                <Text type="secondary">과매수 (70)</Text>
              </div>

              {signalStrength && (
                <Tag color={signalStrength.color} style={{ marginTop: 4 }}>
                  {signalStrength.label}
                </Tag>
              )}
            </Space>
          </div>
        )}

        {/* 모드 결정 이유 */}
        <Alert
          message="모드 결정 이유"
          description={reason}
          type="info"
          showIcon
          style={{ marginTop: 8 }}
        />

        {/* 모드 설명 */}
        <div
          style={{
            background: 'white',
            padding: 12,
            borderRadius: 6,
            border: '1px solid #d9d9d9'
          }}
        >
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">매매 조건:</Text>
              <Text>{currentModeInfo.description}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">위험도:</Text>
              <Tag color={mode === 'safe' ? 'orange' : 'red'}>{currentModeInfo.risk}</Tag>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">예상수익:</Text>
              <Text strong style={{ color: mode === 'safe' ? '#52c41a' : '#ff4d4f' }}>
                {currentModeInfo.expectedReturn}
              </Text>
            </div>
          </Space>
        </div>

        {/* RSI 모드 조건 안내 */}
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <strong>안전모드 진입:</strong> RSI 하락/하향 돌파<br/>
            <strong>공세모드 진입:</strong> RSI 상승/상향 돌파
          </Text>
        </div>
      </Space>
    </Card>
  );
};
