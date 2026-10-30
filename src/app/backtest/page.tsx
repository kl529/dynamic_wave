'use client'

import React, { useState } from 'react';
import { Layout, Card, Space, Button, message, Alert, Table, Tag, Typography, Segmented } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Text } = Typography;
import { useRouter } from 'next/navigation';
import { BacktestConfigPanel, type BacktestConfig } from '@/components/BacktestConfigPanel';
import { BacktestResultsChart } from '@/components/BacktestResultsChart';
import { BacktestStatsDashboard } from '@/components/BacktestStatsDashboard';
import { BacktestDebugTable } from '@/components/BacktestDebugTable';
import { StrategyBacktest } from '@/components/StrategyBacktest';
import { DivisionEngine } from '@/services/divisionEngine';
import { MarketDataService } from '@/services/marketDataService';
import { enrichDataWithWeeklyRSIMode } from '@/utils/rsiCalculator';
import { DEFAULT_CONFIG, TIMING, BACKTEST } from '@/constants';
import type { DailyTradeRecord, MarketData, ModeConfig } from '@/types';

const { Content } = Layout;

interface SweepResult {
  label: string;
  safeSellTarget: number;
  aggrSellTarget: number;
  returnRate: number;
  annualizedReturn: number;
  maxDrawdown: number;
  winRate: number;
  tradeCount: number;
  finalAssets: number;
}

export default function BacktestPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<BacktestConfig>({
    initialCapital: DEFAULT_CONFIG.initialCapital,
    divisions: DEFAULT_CONFIG.divisions,
    mode: DEFAULT_CONFIG.mode,
    rebalancePeriod: DEFAULT_CONFIG.rebalancePeriod,
    startDate: new Date(Date.now() - TIMING.DAYS_90_MS).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [backtestResults, setBacktestResults] = useState<DailyTradeRecord[]>([]);
  const [hasRunBacktest, setHasRunBacktest] = useState(false);
  const [sweepResults, setSweepResults] = useState<SweepResult[]>([]);
  const [sweepLoading, setSweepLoading] = useState(false);
  const [kind, setKind] = useState<'trend' | 'dongpa'>('trend');

  const handleConfigChange = (newConfig: BacktestConfig) => {
    setConfig(newConfig);
  };

  const handleRunBacktest = async () => {
    setLoading(true);
    setHasRunBacktest(false);

    try {
      message.loading({ content: '백테스팅 실행 중...', key: 'backtest', duration: 0 });

      // 백테스팅 엔진 초기화
      const customModeConfigs: Partial<Record<'safe' | 'aggressive', Partial<ModeConfig>>> = {};
      if (config.customSafe && Object.values(config.customSafe).some(v => v != null)) {
        customModeConfigs.safe = {
          ...(config.customSafe.sellTarget != null && { sellTarget: config.customSafe.sellTarget }),
          ...(config.customSafe.buyTarget != null && { buyTarget: config.customSafe.buyTarget }),
          ...(config.customSafe.holdingDays != null && { holdingDays: config.customSafe.holdingDays }),
        };
      }
      if (config.customAggressive && Object.values(config.customAggressive).some(v => v != null)) {
        customModeConfigs.aggressive = {
          ...(config.customAggressive.sellTarget != null && { sellTarget: config.customAggressive.sellTarget }),
          ...(config.customAggressive.buyTarget != null && { buyTarget: config.customAggressive.buyTarget }),
          ...(config.customAggressive.holdingDays != null && { holdingDays: config.customAggressive.holdingDays }),
        };
      }
      const engine = new DivisionEngine(
        {
          initialCapital: config.initialCapital,
          divisions: config.divisions,
          mode: config.mode,
          rebalancePeriod: config.rebalancePeriod,
          hybrid: config.hybrid && config.mode === 'auto' ? true : undefined
        },
        Object.keys(customModeConfigs).length > 0 ? customModeConfigs : undefined
      );

      const { marketData, modesByDate } = await fetchHistoricalMarketData(config.startDate, config.endDate);

      // 백테스팅 실행 (RSI 모드 적용)
      const results = engine.backtest(
        marketData,
        config.mode === 'auto' ? modesByDate : undefined
      );

      setBacktestResults(results);
      setHasRunBacktest(true);

      message.success({ content: '백테스팅 완료!', key: 'backtest', duration: 2 });
    } catch (error: any) {
      console.error('백테스팅 실패:', error);
      message.error({ content: `백테스팅 실패: ${error.message}`, key: 'backtest', duration: 3 });
    } finally {
      setLoading(false);
    }
  };

  const handleParameterSweep = async () => {
    setSweepLoading(true);
    setSweepResults([]);
    try {
      message.loading({ content: '파라미터 스윕 실행 중...', key: 'sweep', duration: 0 });

      const { marketData, modesByDate } = await fetchHistoricalMarketData(config.startDate, config.endDate);

      const days = marketData.length;
      const years = days / 252;

      // 스윕 조합: 안전 매도 0.2/0.5/1.0/1.5/2.0% × 공세 매도 1.5/2.5/3.5%
      const safeSellTargets = [0.002, 0.005, 0.010, 0.015, 0.020];
      const aggrSellTargets = [0.015, 0.025, 0.035];
      const results: SweepResult[] = [];

      for (const safeSell of safeSellTargets) {
        for (const aggrSell of aggrSellTargets) {
          const eng = new DivisionEngine(
            { initialCapital: config.initialCapital, divisions: config.divisions, mode: config.mode, rebalancePeriod: config.rebalancePeriod },
            { safe: { sellTarget: safeSell }, aggressive: { sellTarget: aggrSell } }
          );
          const records = eng.backtest(marketData, config.mode === 'auto' ? modesByDate : undefined);
          if (!records.length) continue;

          const finalAssets = records[records.length - 1].totalAssets;
          const returnRate = ((finalAssets - config.initialCapital) / config.initialCapital) * 100;
          const annualizedReturn = years > 0 ? (Math.pow(finalAssets / config.initialCapital, 1 / years) - 1) * 100 : 0;

          let peak = config.initialCapital;
          let maxDrawdown = 0;
          records.forEach(r => {
            if (r.totalAssets > peak) peak = r.totalAssets;
            const dd = (peak - r.totalAssets) / peak * 100;
            if (dd > maxDrawdown) maxDrawdown = dd;
          });

          const allActions = records.flatMap(r => r.divisionActions);
          const sells = allActions.filter(a => a.action === 'SELL' || a.action === 'STOP_LOSS'); // 손절 포함
          const wins = sells.filter(a => (a.profit || 0) > 0);
          const winRate = sells.length > 0 ? (wins.length / sells.length) * 100 : 0;

          results.push({
            label: `안전 ${(safeSell * 100).toFixed(1)}% / 공세 ${(aggrSell * 100).toFixed(1)}%`,
            safeSellTarget: safeSell * 100,
            aggrSellTarget: aggrSell * 100,
            returnRate,
            annualizedReturn,
            maxDrawdown,
            winRate,
            tradeCount: allActions.length,
            finalAssets,
          });
        }
      }

      results.sort((a, b) => b.returnRate - a.returnRate);
      setSweepResults(results);
      message.success({ content: `파라미터 스윕 완료! ${results.length}개 조합 분석`, key: 'sweep', duration: 2 });
    } catch (err: any) {
      message.error({ content: `스윕 실패: ${err.message}`, key: 'sweep', duration: 3 });
    } finally {
      setSweepLoading(false);
    }
  };

  const handleDownloadResults = () => {
    if (backtestResults.length === 0) {
      message.warning('다운로드할 결과가 없습니다');
      return;
    }

    // CSV 생성
    const headers = [
      '날짜',
      '종가',
      '변동률(%)',
      '매수량',
      '매도량',
      '순매매량',
      '현금',
      '보유량',
      '평가금액',
      '총자산',
      '수익률(%)',
      '일별손익',
      '재분할여부'
    ];

    const rows = backtestResults.map(trade => [
      trade.date,
      trade.closePrice.toFixed(2),
      trade.changeRate.toFixed(2),
      trade.totalBuyQuantity,
      trade.totalSellQuantity,
      trade.netQuantity,
      trade.totalCash.toFixed(2),
      trade.totalHoldings,
      trade.totalValue.toFixed(2),
      trade.totalAssets.toFixed(2),
      trade.returnRate.toFixed(2),
      trade.dailyRealizedPL.toFixed(2),
      trade.isRebalanceDay ? 'O' : 'X'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // BOM 추가 (한글 깨짐 방지)
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backtest_${config.startDate}_to_${config.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    message.success('결과가 다운로드되었습니다');
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Content style={{ padding: '24px' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto' }}>
          {/* 헤더 */}
          <Card style={{ marginBottom: 24 }}>
            <Space size="large" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space>
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={() => router.push('/')}
                >
                  돌아가기
                </Button>
                <div>
                  <h1 style={{ margin: 0, fontSize: 28, fontWeight: 'bold' }}>
                    📊 백테스팅
                  </h1>
                  <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
                    과거 데이터로 매매 전략을 검증하세요
                  </p>
                </div>
              </Space>

              {kind === 'dongpa' && hasRunBacktest && (
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleDownloadResults}
                >
                  결과 다운로드 (CSV)
                </Button>
              )}
            </Space>
          </Card>

          <Segmented
            value={kind}
            onChange={v => setKind(v as 'trend' | 'dongpa')}
            options={[{ label: '추천 전략 (QLD 추세)', value: 'trend' }, { label: '동파법 (SOXL)', value: 'dongpa' }]}
            style={{ marginBottom: 16 }}
          />

          {kind === 'trend' && <StrategyBacktest />}

          {kind === 'dongpa' && (<>
          {/* 안내 메시지 */}
          {!hasRunBacktest && (
            <Alert
              message="백테스팅 시작하기"
              description="아래에서 백테스팅 설정을 완료하고 '백테스팅 시작' 버튼을 클릭하세요. 과거 데이터를 기반으로 매매 전략의 성과를 시뮬레이션합니다."
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />
          )}

          {/* 설정 패널 */}
          <BacktestConfigPanel
            config={config}
            onConfigChange={handleConfigChange}
            onRunBacktest={handleRunBacktest}
            loading={loading}
          />

          {/* 파라미터 스윕 */}
          <Card
            style={{ marginTop: 24 }}
            title={
              <Space>
                <ThunderboltOutlined style={{ color: '#faad14' }} />
                <span>파라미터 최적화 스윕</span>
                <Tag color="gold">자동 최적화</Tag>
              </Space>
            }
            extra={
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={sweepLoading}
                onClick={handleParameterSweep}
                style={{ background: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)', border: 'none' }}
              >
                {sweepLoading ? '스윕 실행 중...' : '최적 파라미터 찾기'}
              </Button>
            }
          >
            <Alert
              message="매도 임계값 자동 탐색"
              description="안전모드 매도 목표(0.2%/0.5%/1.0%/1.5%/2.0%) × 공세모드 매도 목표(1.5%/2.5%/3.5%) — 15가지 조합을 자동으로 백테스팅하고 수익률 순으로 정렬합니다. 설정 패널의 기간·자본·분할수·재분할 주기를 그대로 사용합니다."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            {sweepResults.length > 0 && (
              <Table
                dataSource={sweepResults}
                rowKey="label"
                size="small"
                pagination={false}
                rowClassName={(_, index) => index === 0 ? 'sweep-best-row' : ''}
                columns={[
                  {
                    title: '순위',
                    render: (_: any, __: any, index: number) => (
                      <span style={{ fontWeight: index === 0 ? 'bold' : 'normal', color: index === 0 ? '#52c41a' : undefined }}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                      </span>
                    ),
                    width: 60,
                  },
                  {
                    title: '파라미터',
                    dataIndex: 'label',
                    render: (label: string, _: any, index: number) => (
                      <Text strong={index === 0}>{label}</Text>
                    ),
                  },
                  {
                    title: '수익률',
                    dataIndex: 'returnRate',
                    sorter: (a: SweepResult, b: SweepResult) => a.returnRate - b.returnRate,
                    render: (v: number) => (
                      <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
                        {v >= 0 ? '+' : ''}{v.toFixed(2)}%
                      </span>
                    ),
                  },
                  {
                    title: '연환산',
                    dataIndex: 'annualizedReturn',
                    render: (v: number) => (
                      <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>
                        {v >= 0 ? '+' : ''}{v.toFixed(1)}%/년
                      </span>
                    ),
                  },
                  {
                    title: 'MDD',
                    dataIndex: 'maxDrawdown',
                    render: (v: number) => <span style={{ color: '#ff4d4f' }}>-{v.toFixed(1)}%</span>,
                  },
                  {
                    title: '승률',
                    dataIndex: 'winRate',
                    render: (v: number) => (
                      <span style={{ color: v >= 50 ? '#52c41a' : '#ff7a45' }}>{v.toFixed(1)}%</span>
                    ),
                  },
                  {
                    title: '매매횟수',
                    dataIndex: 'tradeCount',
                  },
                  {
                    title: '최종자산',
                    dataIndex: 'finalAssets',
                    render: (v: number) => `$${v.toFixed(0)}`,
                  },
                ]}
              />
            )}
          </Card>

          {/* 결과 표시 */}
          {hasRunBacktest && backtestResults.length > 0 && (
            <>
              {/* 통계 대시보드 */}
              <BacktestStatsDashboard
                trades={backtestResults}
                initialCapital={config.initialCapital}
                config={{
                  divisions: config.divisions,
                  mode: config.mode,
                  rebalancePeriod: config.rebalancePeriod
                }}
              />

              {/* 차트 */}
              <BacktestResultsChart
                trades={backtestResults}
                loading={loading}
                initialCapital={config.initialCapital}
              />

              {/* 분할별 상세 데이터 테이블 */}
              <BacktestDebugTable
                trades={backtestResults}
                initialCapital={config.initialCapital}
              />
            </>
          )}
          </>)}
        </div>
      </Content>
    </Layout>
  );
}

/**
 * 기간 데이터와 날짜별 RSI 모드. 주간 RSI는 시작일 이전 데이터부터 계산해야 값이 수렴하므로
 * 시작일보다 RSI_WARMUP_DAYS 거래일 앞에서부터 받아 모드를 계산한 뒤 기간만 잘라낸다.
 */
async function fetchHistoricalMarketData(
  startDate: string,
  endDate: string
): Promise<{ marketData: MarketData[]; modesByDate: Map<string, 'safe' | 'aggressive' | 'bull' | 'cash'> }> {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error('잘못된 백테스트 기간입니다.');
  }

  // 오늘로부터 startDate까지의 거래일 수 (주말 제외 근사) + 워밍업
  const MILLIS_PER_DAY = 1000 * 60 * 60 * 24;
  const calendarDays = Math.ceil((Date.now() - start.getTime()) / MILLIS_PER_DAY);
  const totalDays = Math.max(Math.ceil((calendarDays * 5) / 7) + BACKTEST.BUFFER_DAYS + BACKTEST.RSI_WARMUP_DAYS, BACKTEST.MIN_DAYS);
  const rawData = await MarketDataService.getHistoricalSOXLData(totalDays);

  const startKey = start.toISOString().split('T')[0];
  const endKey = end.toISOString().split('T')[0];

  const modesByDate = new Map(enrichDataWithWeeklyRSIMode(rawData).map(d => [d.date, d.mode]));
  const marketData = rawData.filter(({ date }) => date >= startKey && date <= endKey);

  if (marketData.length === 0) {
    throw new Error(`${startDate} ~ ${endDate} 기간의 데이터를 찾을 수 없습니다. API에서 제공하는 데이터 범위를 확인해주세요.`);
  }

  return { marketData, modesByDate };
}
