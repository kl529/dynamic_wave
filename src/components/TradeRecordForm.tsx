'use client'

import React, { useState } from 'react';
import { Card, Form, Select, InputNumber, DatePicker, Input, Button, message, Space, Row, Col } from 'antd';
import { PlusOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;

export const TradeRecordForm: React.FC<{ onSave?: (record: any) => void }> = ({ onSave }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const record = {
        id: Date.now(),
        date: values.date.format('YYYY-MM-DD'),
        division: values.division,
        action: values.action,
        quantity: values.quantity,
        price: values.price,
        amount: values.quantity * values.price,
        comment: values.comment || '',
        createdAt: new Date().toISOString()
      };

      // localStorage에 저장
      const existingRecords = JSON.parse(localStorage.getItem('tradeRecords') || '[]');
      existingRecords.push(record);
      localStorage.setItem('tradeRecords', JSON.stringify(existingRecords));

      message.success('매매 기록이 저장되었습니다!');
      form.resetFields();
      onSave && onSave(record);
    } catch (error) {
      message.error('저장 실패: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title="📝 매매 기록 입력"
      style={{ marginBottom: 16 }}
      extra={<PlusOutlined />}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          date: dayjs(),
          action: 'BUY'
        }}
      >
        <Row gutter={[16, 0]}>
          <Col xs={24} sm={12} md={6}>
            <Form.Item
              label="날짜"
              name="date"
              rules={[{ required: true, message: '날짜를 선택하세요' }]}
            >
              <DatePicker
                format="YYYY-MM-DD"
                placeholder="날짜 선택"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>

          <Col xs={12} sm={6} md={4}>
            <Form.Item
              label="분할"
              name="division"
              rules={[{ required: true, message: '분할 선택' }]}
            >
              <Select placeholder="분할">
                {[1, 2, 3, 4, 5].map(num => (
                  <Option key={num} value={num}>분할 {num}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>

          <Col xs={12} sm={6} md={4}>
            <Form.Item
              label="매매"
              name="action"
              rules={[{ required: true }]}
            >
              <Select>
                <Option value="BUY">매수</Option>
                <Option value="SELL">매도</Option>
              </Select>
            </Form.Item>
          </Col>

          <Col xs={12} sm={6} md={5}>
            <Form.Item
              label="수량"
              name="quantity"
              rules={[{ required: true, message: '수량 입력' }]}
            >
              <InputNumber
                min={1}
                placeholder="주"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>

          <Col xs={12} sm={6} md={5}>
            <Form.Item
              label="가격"
              name="price"
              rules={[{ required: true, message: '가격 입력' }]}
            >
              <InputNumber
                min={0}
                step={0.01}
                prefix="$"
                placeholder="0.00"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="코멘트" name="comment">
          <TextArea
            rows={2}
            placeholder="매매 이유나 메모를 입력하세요 (선택)"
            maxLength={200}
            showCount
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            icon={<SaveOutlined />}
            block
          >
            기록 저장
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};
