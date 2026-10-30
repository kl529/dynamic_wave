'use client'

import React, { useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, InputNumber, Row, Segmented, Select, Table, Tooltip } from 'antd';
import { InfoCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { MarketDataService } from '@/services/marketDataService';
import { strategyBacktest, Product, BacktestLine } from '@/lib/strategyBacktest';
import { STRATEGY } from '@/lib/strategy';

const PERIOD_SETS: { label: string; value: string; periods: number[] }[] = [
  { label: '100~300일 (기본)', value: 'default', periods: [...STRATEGY.periods] },
  { label: '50~250일', value: 'short', periods: [50, 100, 150, 200, 250] },
  { label: '150~350일', value: 'long', periods: [150, 200, 250, 300, 350] },
  { label: '200일 하나', value: 'single', periods: [200] },
];
const PRODUCTS: { label: string; value: Product }[] = [
  { label: 'QQQ (나스닥100 1배)', value: 'QQQ' },
  { label: 'QLD (2배)', value: 'QLD' },
  { label: 'TQQQ (3배, 기본)', value: 'TQQQ' },
];
// dataviz 기준 팔레트 1~3번 (색각 검사 통과)
const COLORS = { strategy: '#2a78d6', hold: '#eb6834', spy: '#1baf7a' };

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const money = (x: number) => (x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : x >= 1e3 ? `$${(x / 1e3).toFixed(1)}K` : `$${x.toFixed(0)}`);

type Result = ReturnType<typeof strategyBacktest>;

export const StrategyBacktest: React.FC = () => {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs('2006-07-01'), dayjs()]);
  const [capital, setCapital] = useState(10000);
  const [product, setProduct] = useState<Product>('TQQQ');
  const [volFilter, setVolFilter] = useState(true);
  const [fee, setFee] = useState(0.0009);
  const [periodSet, setPeriodSet] = useState('default');
  const [weekly, setWeekly] = useState(false);
  const [tax, setTax] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      // 지수는 전체 기록(변동성 필터 중앙값을 처음부터 누적), 상품·S&P500은 시작일 이전 여유분까지
      const days = Math.ceil((dayjs().diff(range[0], 'day') * 5) / 7) + 450;
      const [index, prod, spy] = await Promise.all([
        MarketDataService.getHistory('^NDX', 12000),
        MarketDataService.getHistory(product, days, true),
        MarketDataService.getHistory('SPY', days, true),
      ]);
      const toSeries = (d: { date: string; price: number }[]) => d.map(({ date, price }) => ({ date, price }));
      setResult(strategyBacktest(
        {
          product, periods: PERIOD_SETS.find(p => p.value === periodSet)!.periods, volFilter, weekly, tax, fee,
          from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), capital,
        },
        { index: toSeries(index), product: toSeries(prod), spy: toSeries(spy) }
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const names: Record<BacktestLine['key'], string> = { strategy: '추세 전략', hold: `${product} 그냥 보유`, spy: 'S&P500 그냥 보유' };

  // 차트: 주 1회로 줄인 자산 곡선
  const spyByDate = new Map(result ? result.lines[2].dates.map((d, i) => [d, result.lines[2].values[i]]) : []);
  const chartData = result
    ? result.lines[0].dates
        .map((date, i) => ({ date, strategy: result.lines[0].values[i], hold: result.lines[1].values[i], spy: spyByDate.get(date) }))
        .filter((d, i, a) => d.spy !== undefined && (i % 5 === 0 || i === a.length - 1))
    : [];
  const exposureData = result ? result.exposure.filter((_, i, a) => i % 5 === 0 || i === a.length - 1).map(e => ({ date: e.date, value: e.value * 100 })) : [];
  const years = result ? Object.keys(result.lines[0].stats.yearly) : [];

  return (
    <>
      <Card title="추세 전략 백테스트" style={{ marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
        <Row gutter={[12, 12]} align="bottom">
          <Col xs={24} md={8} lg={4}>
            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>기간</div>
            <DatePicker.RangePicker
              value={range}
              onChange={v => v?.[0] && v?.[1] && setRange([v[0], v[1]])}
              disabledDate={d => d.isBefore('1999-03-10') || d.isAfter(dayjs())}
              style={{ width: '100%' }}
              allowClear={false}
            />
          </Col>
          <Col xs={12} md={4} lg={2}>
            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>시작 자금</div>
            <InputNumber value={capital} min={100} step={1000} prefix="$" onChange={v => setCapital(v ?? 10000)} style={{ width: '100%' }} />
          </Col>
          <Col xs={12} md={4} lg={3}>
            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>상품</div>
            <Select value={product} options={PRODUCTS} onChange={setProduct} style={{ width: '100%' }} />
          </Col>
          <Col xs={12} md={4} lg={3}>
            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>
              이동평균{' '}
              <Tooltip title="종가가 이 이동평균들 중 몇 개 위에 있는지의 비율만큼 보유합니다. 구성을 바꿔도 결과 차이는 작았습니다 (docs/validation/tuning.md).">
                <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
              </Tooltip>
            </div>
            <Select value={periodSet} options={PERIOD_SETS.map(({ label, value }) => ({ label, value }))} onChange={setPeriodSet} style={{ width: '100%' }} />
          </Col>
          <Col xs={12} md={4} lg={3}>
            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>
              변동성 필터{' '}
              <Tooltip title="최근 20일 변동성이 과거 중앙값보다 높으면 그 비율만큼 비중을 줄입니다 (20%p 단위).">
                <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
              </Tooltip>
            </div>
            <Segmented block value={volFilter ? '켬' : '끔'} options={['켬', '끔']} onChange={v => setVolFilter(v === '켬')} />
          </Col>
          <Col xs={12} md={4} lg={2}>
            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>수수료</div>
            <Select value={fee} onChange={setFee} style={{ width: '100%' }} options={[{ label: '0.09%', value: 0.0009 }, { label: '0.25%', value: 0.0025 }, { label: '0.047%', value: 0.00047 }]} />
          </Col>
          <Col xs={12} md={4} lg={3}>
            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>비중 조정</div>
            <Segmented block value={weekly ? '주 1회' : '매일'} options={['매일', '주 1회']} onChange={v => setWeekly(v === '주 1회')} />
          </Col>
          <Col xs={12} md={4} lg={2}>
            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>양도세 22%</div>
            <Segmented block value={tax ? '반영' : '제외'} options={['반영', '제외']} onChange={v => setTax(v === '반영')} />
          </Col>
          <Col xs={12} md={4} lg={2}>
            <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={run} block>실행</Button>
          </Col>
        </Row>
      </Card>

      {error && <Alert type="error" showIcon message="백테스트 실패" description={error} style={{ marginBottom: 16 }} />}

      {result && (
        <>
          <Card
            title={`${result.from} ~ ${result.to}`}
            extra={
              <Tooltip title={`${product} 상장일 이전은 실제 데이터가 없어 여기서는 볼 수 없습니다. 상장 전(합성)까지 넣은 1995~2026 검증에서는 닷컴 붕괴 때 TQQQ 그냥 보유는 -99% 이상(사실상 전액 손실), TQQQ 추세 + 변동성 필터는 -53%였습니다.`}>
                <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
              </Tooltip>
            }
            style={{ marginBottom: 16 }}
            styles={{ body: { padding: 0 } }}
          >
            <Table
              size="small"
              pagination={false}
              rowKey="key"
              dataSource={result.lines}
              columns={[
                {
                  title: '방법', dataIndex: 'key',
                  render: (k: BacktestLine['key']) => (
                    <span style={{ fontWeight: k === 'strategy' ? 700 : 400 }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: COLORS[k], marginRight: 6 }} />
                      {names[k]}
                    </span>
                  ),
                },
                { title: '최종 자산', dataIndex: 'final', align: 'right', render: (v: number) => money(v) },
                { title: '연복리', key: 'cagr', align: 'right', render: (_: unknown, l: BacktestLine) => pct(l.stats.cagr) },
                { title: '최대 낙폭', key: 'mdd', align: 'right', render: (_: unknown, l: BacktestLine) => pct(l.stats.mdd) },
                { title: '최악 연도', key: 'worst', align: 'right', responsive: ['md'], render: (_: unknown, l: BacktestLine) => pct(l.stats.worstYear) },
                {
                  title: '연 매매일', key: 'trades', align: 'right', responsive: ['md'],
                  render: (_: unknown, l: BacktestLine) => (l.key === 'strategy' ? l.stats.tradesPerYear.toFixed(0) : '-'),
                },
              ]}
            />
          </Card>

          <Card title="자산 추이 (로그 축)" style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 8px 4px' } }}>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="#eee" vertical={false} />
                <XAxis dataKey="date" tickFormatter={d => d.slice(0, 4)} minTickGap={40} tick={{ fontSize: 12 }} />
                <YAxis scale="log" domain={['auto', 'auto']} tickFormatter={money} tick={{ fontSize: 12 }} width={64} allowDataOverflow />
                <ChartTooltip formatter={(v: number, k: string) => [money(v), names[k as BacktestLine['key']]]} labelStyle={{ fontWeight: 600 }} />
                <Legend formatter={(k: string) => names[k as BacktestLine['key']]} />
                {(['strategy', 'hold', 'spy'] as const).map(k => (
                  <Line key={k} dataKey={k} stroke={COLORS[k]} strokeWidth={2} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title={`${product} 보유 비중`} style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 8px 4px' } }}>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={exposureData} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="#eee" vertical={false} />
                <XAxis dataKey="date" tickFormatter={d => d.slice(0, 4)} minTickGap={40} tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} width={64} />
                <ChartTooltip formatter={(v: number) => [`${v.toFixed(0)}%`, '비중']} />
                <Area type="stepAfter" dataKey="value" stroke={COLORS.strategy} fill={COLORS.strategy} fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card title="연도별 수익률" styles={{ body: { padding: 0 } }}>
            <Table
              size="small"
              pagination={false}
              rowKey="year"
              dataSource={years.map(year => ({ year, ...Object.fromEntries(result.lines.map(l => [l.key, l.stats.yearly[year]])) }))}
              columns={[
                { title: '연도', dataIndex: 'year' },
                ...result.lines.map(l => ({
                  title: names[l.key], dataIndex: l.key, align: 'right' as const,
                  render: (v?: number) => (v === undefined ? '-' : <span style={{ color: v >= 0 ? '#cf1322' : '#0958d9' }}>{pct(v)}</span>),
                })),
              ]}
            />
          </Card>
        </>
      )}
    </>
  );
};
