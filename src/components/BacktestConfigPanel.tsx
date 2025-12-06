'use client'

import React from 'react';
import {
  Card,
  Form,
  InputNumber,
  Select,
  DatePicker,
  Button,
  Space,
  Divider,
  Typography,
  Tag,
  Tooltip,
  Row,
  Col
} from 'antd';
import {
  PlayCircleOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  RocketOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

export type BacktestMode = 'safe' | 'aggressive' | 'auto';

export interface BacktestConfig {
  initialCapital: number;
  divisions: number;
  mode: BacktestMode;
  rebalancePeriod: number;
  startDate: string;
  endDate: string;
}

interface BacktestConfigPanelProps {
  config: BacktestConfig;
  onConfigChange: (config: BacktestConfig) => void;
  onRunBacktest: () => void;
  loading?: boolean;
}

export const BacktestConfigPanel: React.FC<BacktestConfigPanelProps> = ({
  config,
  onConfigChange,
  onRunBacktest,
  loading = false
}) => {
  const [form] = Form.useForm();

  const modeInfo: Record<BacktestMode, {
    name: string;
    color: string;
    buyTarget: string;
    sellTarget: string;
    holdingDays: string;
    description: string;
  }> = {
    safe: {
      name: '안전모드',
      color: 'blue',
      buyTarget: '3.0%',
      sellTarget: '0.2%',
      holdingDays: '30거래일',
      description: '보수적 매매, 안정적 수익'
    },
    aggressive: {
      name: '공세모드',
      color: 'red',
      buyTarget: '5.0%',
      sellTarget: '2.5%',
      holdingDays: '7거래일',
      description: '공격적 매매, 높은 수익률'
    },
    auto: {
      name: 'RSI 자동모드',
      color: 'gold',
      buyTarget: 'RSI 조건 (안전 3% / 공세 5%)',
      sellTarget: 'RSI 조건 (0.2% / 2.5%)',
      holdingDays: '안전 30일 / 공세 7일',
      description: '매일 RSI 지표로 안전/공세 모드를 자동 전환'
    }
  };

  const currentModeInfo = modeInfo[config.mode] ?? modeInfo.safe;
  const modeCardPalette: Record<string, { bg: string; border: string }> = {
    blue: { bg: '#e6f7ff', border: '#91d5ff' },
    red: { bg: '#fff1f0', border: '#ffa39e' },
    gold: { bg: '#fffbe6', border: '#ffe58f' }
  };
  const currentPalette = modeCardPalette[currentModeInfo.color] || modeCardPalette.blue;

  const handleSubmit = (values: any) => {
    const newConfig: BacktestConfig = {
      initialCapital: values.initialCapital,
      divisions: values.divisions,
      mode: values.mode,
      rebalancePeriod: values.rebalancePeriod,
      startDate: values.dateRange[0].format('YYYY-MM-DD'),
      endDate: values.dateRange[1].format('YYYY-MM-DD')
    };
    onConfigChange(newConfig);
    onRunBacktest();
  };

  const handleReset = () => {
    form.setFieldsValue({
      initialCapital: 10000,
      divisions: 5,
      mode: 'auto',
      rebalancePeriod: 10,
      dateRange: [dayjs().subtract(3, 'month'), dayjs()]
    });
  };

  return (
    <Card
      title={
        <Space>
          <RocketOutlined />
          <span>백테스팅 설정</span>
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={handleReset}
          size="small"
        >
          초기화
        </Button>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          initialCapital: config.initialCapital,
          divisions: config.divisions,
          mode: config.mode,
          rebalancePeriod: config.rebalancePeriod,
          dateRange: [dayjs(config.startDate), dayjs(config.endDate)]
        }}
      >
        <Row gutter={16}>
          {/* 좌측: 기본 설정 */}
          <Col xs={24} md={12}>
            <Title level={5}>💰 기본 설정</Title>

            <Form.Item
              label="초기 자본금"
              name="initialCapital"
              rules={[{ required: true, message: '초기 자본금을 입력하세요' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={1000}
                max={1000000}
                step={1000}
                formatter={(value) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => Number(value!.replace(/\$\s?|(,*)/g, '')) as 1000 | 1000000}
                size="large"
              />
            </Form.Item>

            <Form.Item
              label={
                <Space>
                  <span>분할 수</span>
                  <Tooltip title="자본을 몇 개로 나눌지 결정합니다. 3~10개 권장">
                    <InfoCircleOutlined style={{ color: '#888' }} />
                  </Tooltip>
                </Space>
              }
              name="divisions"
              rules={[{ required: true, message: '분할 수를 선택하세요' }]}
            >
              <Select size="large">
                <Option value={3}>3분할</Option>
                <Option value={5}>5분할 (권장)</Option>
                <Option value={7}>7분할</Option>
                <Option value={10}>10분할</Option>
              </Select>
            </Form.Item>

            <Form.Item
              label={
                <Space>
                  <span>재분할 주기</span>
                  <Tooltip title="N거래일마다 전체 자산을 재분할합니다">
                    <InfoCircleOutlined style={{ color: '#888' }} />
                  </Tooltip>
                </Space>
              }
              name="rebalancePeriod"
              rules={[{ required: true, message: '재분할 주기를 선택하세요' }]}
            >
              <Select size="large">
                <Option value={5}>5거래일</Option>
                <Option value={10}>10거래일 (권장)</Option>
                <Option value={15}>15거래일</Option>
                <Option value={20}>20거래일</Option>
                <Option value={30}>30거래일</Option>
              </Select>
            </Form.Item>
          </Col>

          {/* 우측: 매매 모드 & 기간 */}
          <Col xs={24} md={12}>
            <Title level={5}>📊 매매 전략</Title>

            <Form.Item
              label="매매 모드"
              name="mode"
              rules={[{ required: true, message: '매매 모드를 선택하세요' }]}
            >
              <Select size="large" onChange={(value) => onConfigChange({ ...config, mode: value })}>
                <Option value="auto">
                  <Space>
                    <span>🤖 RSI 자동모드</span>
                    <Tag color="gold">RSI 기반</Tag>
                  </Space>
                </Option>
                <Option value="safe">
                  <Space>
                    <span>🛡️ 안전모드</span>
                    <Tag color="blue">초보자 추천</Tag>
                  </Space>
                </Option>
                <Option value="aggressive">
                  <Space>
                    <span>⚡ 공세모드</span>
                    <Tag color="red">고수익 고위험</Tag>
                  </Space>
                </Option>
              </Select>
            </Form.Item>

            {/* 모드 상세 정보 */}
            <div
              style={{
                background: currentPalette.bg,
                padding: 16,
                borderRadius: 8,
                marginBottom: 16,
                border: `1px solid ${currentPalette.border}`
              }}
            >
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <div>
                  <Text strong>{currentModeInfo.name}</Text>
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                    {currentModeInfo.description}
                  </Text>
                </div>
                <Divider style={{ margin: '8px 0' }} />
                <Row gutter={8}>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>매수 조건:</Text>
                    <div><Text strong>{currentModeInfo.buyTarget}</Text> 하락</div>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>매도 조건:</Text>
                    <div><Text strong>{currentModeInfo.sellTarget}</Text> 수익</div>
                  </Col>
                </Row>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>최대 보유:</Text>
                  <Text strong style={{ marginLeft: 4 }}>{currentModeInfo.holdingDays}</Text>
                </div>
              </Space>
            </div>

            <Form.Item
              label="백테스팅 기간"
              name="dateRange"
              rules={[{ required: true, message: '백테스팅 기간을 선택하세요' }]}
            >
              <RangePicker
                style={{ width: '100%' }}
                size="large"
                format="YYYY-MM-DD"
                maxDate={dayjs()}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* 실행 버튼 */}
        <Divider />
        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            icon={<PlayCircleOutlined />}
            size="large"
            loading={loading}
            block
            style={{
              height: 56,
              fontSize: 18,
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none'
            }}
          >
            {loading ? '백테스팅 실행 중...' : '백테스팅 시작'}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};
