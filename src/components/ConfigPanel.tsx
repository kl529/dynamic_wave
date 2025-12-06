'use client'

import React from 'react';
import { Card, InputNumber, Select, Radio, Slider, Typography, Space, Tag, Tooltip } from 'antd';
import { InfoCircleOutlined, DollarOutlined, SettingOutlined } from '@ant-design/icons';
import { DongpaConfig } from '@/types';
import { RSIModeIndicator } from './RSIModeIndicator';

const { Title, Text } = Typography;
const { Option } = Select;

interface ConfigPanelProps {
  config: DongpaConfig;
  onConfigChange: (newConfig: Partial<DongpaConfig>) => void;
  divisionAmount: number;
  disabled?: boolean;
  // RSI 관련 props 추가
  rsiMode?: {
    mode: 'safe' | 'aggressive';
    rsi: number | null;
    prevRSI: number | null;
    reason: string;
    signalStrength?: {
      strength: number;
      label: string;
      color: string;
    };
    lastUpdateDate?: string; // 마지막 업데이트 날짜
  };
  showRSIMode?: boolean; // RSI 모드 표시 여부 (기본: true)
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  config,
  onConfigChange,
  divisionAmount,
  disabled = false,
  rsiMode,
  showRSIMode = true
}) => {
  const modeInfo = {
    safe: {
      name: '안전모드',
      color: 'blue',
      description: '3% 하락시 매수, 0.2% 수익시 매도',
      risk: '중간',
      expectedReturn: '연 15-25%',
    },
    aggressive: {
      name: '공세모드', 
      color: 'red',
      description: '5% 하락시 매수, 2.5% 수익시 매도',
      risk: '높음',
      expectedReturn: '연 30-50%',
    }
  };

  const currentModeInfo = modeInfo[config.mode];

  return (
    <Card
      title={
        <Space>
          <SettingOutlined />
          <span>동파법 설정</span>
        </Space>
      }
      className="config-panel"
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* 투자금액 설정 */}
        <div>
          <Title level={5}>
            <DollarOutlined style={{ marginRight: 8 }} />
            투자금액
          </Title>
          <InputNumber
            value={config.initialCapital}
            onChange={(value) => onConfigChange({ initialCapital: value || 10000 })}
            min={1000}
            max={1000000}
            step={1000}
            formatter={(value) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => Number(value!.replace(/\$\s?|(,*)/g, ''))}
            style={{ width: '100%' }}
            size="large"
            disabled={disabled}
          />
          <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>
            분할당 금액: ${divisionAmount.toLocaleString()}
          </Text>
        </div>

        {/* 분할 수 설정 */}
        <div>
          <Title level={5}>
            분할 횟수: {config.divisions}회
            <Tooltip title="분할 수가 많을수록 안정적이지만 기회비용이 증가합니다">
              <InfoCircleOutlined style={{ marginLeft: 8, color: '#8c8c8c' }} />
            </Tooltip>
          </Title>
          <Slider
            value={config.divisions}
            onChange={(value) => onConfigChange({ divisions: value })}
            min={3}
            max={10}
            marks={{
              3: '3회',
              5: '5회',
              7: '7회',
              10: '10회'
            }}
            step={1}
            disabled={disabled}
          />
          <div style={{ marginTop: 8 }}>
            <Space wrap>
              {[3, 5, 7, 10].map(num => (
                <Tag
                  key={num}
                  color={config.divisions === num ? 'blue' : 'default'}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                  onClick={() => !disabled && onConfigChange({ divisions: num })}
                >
                  {num}회
                </Tag>
              ))}
            </Space>
          </div>
        </div>

        {/* RSI 기반 자동 모드 표시 */}
        {showRSIMode && rsiMode ? (
          <RSIModeIndicator
            mode={rsiMode.mode}
            rsi={rsiMode.rsi}
            prevRSI={rsiMode.prevRSI}
            reason={rsiMode.reason}
            signalStrength={rsiMode.signalStrength}
            lastUpdateDate={rsiMode.lastUpdateDate}
          />
        ) : (
          /* 수동 모드 선택 (RSI 데이터 없을 때만 표시) */
          <div>
            <Title level={5}>
              투자 모드
              <Tooltip title="RSI 데이터 로딩 중... 로딩 완료 후 자동으로 결정됩니다">
                <InfoCircleOutlined style={{ marginLeft: 8, fontSize: 14, color: '#faad14' }} />
              </Tooltip>
            </Title>
            <Radio.Group
              value={config.mode}
              onChange={(e) => onConfigChange({ mode: e.target.value })}
              style={{ width: '100%' }}
              disabled={disabled}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Radio value="safe" style={{ width: '100%' }}>
                  <div style={{ marginLeft: 8 }}>
                    <Space>
                      <Tag color={modeInfo.safe.color}>{modeInfo.safe.name}</Tag>
                      <Text type="secondary">위험도: {modeInfo.safe.risk}</Text>
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: '12px', color: '#8c8c8c' }}>
                        {modeInfo.safe.description}
                      </Text>
                    </div>
                    <div style={{ marginTop: 2 }}>
                      <Text style={{ fontSize: '12px', color: '#52c41a' }}>
                        예상수익: {modeInfo.safe.expectedReturn}
                      </Text>
                    </div>
                  </div>
                </Radio>

                <Radio value="aggressive" style={{ width: '100%' }}>
                  <div style={{ marginLeft: 8 }}>
                    <Space>
                      <Tag color={modeInfo.aggressive.color}>{modeInfo.aggressive.name}</Tag>
                      <Text type="secondary">위험도: {modeInfo.aggressive.risk}</Text>
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: '12px', color: '#8c8c8c' }}>
                        {modeInfo.aggressive.description}
                      </Text>
                    </div>
                    <div style={{ marginTop: 2 }}>
                      <Text style={{ fontSize: '12px', color: '#f5222d' }}>
                        예상수익: {modeInfo.aggressive.expectedReturn}
                      </Text>
                    </div>
                  </div>
                </Radio>
              </Space>
            </Radio.Group>
          </div>
        )}

        {/* 현재 설정 요약 */}
        <div 
          style={{ 
            background: '#f5f5f5', 
            padding: 12, 
            borderRadius: 6,
            marginTop: 16 
          }}
        >
          <Title level={5} style={{ marginBottom: 8 }}>현재 설정</Title>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>투자금액:</Text>
              <Text strong>${config.initialCapital.toLocaleString()}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>분할횟수:</Text>
              <Text strong>{config.divisions}회</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>분할금액:</Text>
              <Text strong>${divisionAmount.toLocaleString()}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>투자모드:</Text>
              <Space>
                <Tag color={currentModeInfo.color}>{currentModeInfo.name}</Tag>
                {showRSIMode && rsiMode && (
                  <Tag color="purple" style={{ fontSize: 10 }}>RSI 자동</Tag>
                )}
              </Space>
            </div>
          </Space>
        </div>
      </Space>
    </Card>
  );
};