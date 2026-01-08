'use client'

import React, { useState } from 'react';
import { Layout, Card, Space, Button, message, Alert } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { BacktestConfigPanel, type BacktestConfig } from '@/components/BacktestConfigPanel';
import { BacktestResultsChart } from '@/components/BacktestResultsChart';
import { BacktestStatsDashboard } from '@/components/BacktestStatsDashboard';
import { BacktestDebugTable } from '@/components/BacktestDebugTable';
import { DivisionEngine } from '@/services/divisionEngine';
import { MarketDataService } from '@/services/marketDataService';
import { enrichDataWithWeeklyRSIMode } from '@/utils/rsiCalculator';
import { DEFAULT_CONFIG, TIMING, BACKTEST } from '@/constants';
import type { DailyTradeRecord, MarketData } from '@/types';

const { Content } = Layout;

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

  const handleConfigChange = (newConfig: BacktestConfig) => {
    setConfig(newConfig);
  };

  const handleRunBacktest = async () => {
    setLoading(true);
    setHasRunBacktest(false);

    try {
      message.loading({ content: '백테스팅 실행 중...', key: 'backtest', duration: 0 });

      // 백테스팅 엔진 초기화
      const engine = new DivisionEngine({
        initialCapital: config.initialCapital,
        divisions: config.divisions,
        mode: config.mode,
        rebalancePeriod: config.rebalancePeriod
      });

      const marketData = await fetchHistoricalMarketData(
        config.startDate,
        config.endDate
      );

      if (!marketData.length) {
        throw new Error('선택한 기간의 SOXL 종가 데이터를 불러오지 못했습니다.');
      }

      // 주간 RSI 기반 모드 계산
      const dataWithMode = enrichDataWithWeeklyRSIMode(marketData);
      const modesByDate = new Map<string, 'safe' | 'aggressive'>();
      dataWithMode.forEach(day => {
        if (day.mode) {
          modesByDate.set(day.date, day.mode);
        }
      });

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

              {hasRunBacktest && (
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
        </div>
      </Content>
    </Layout>
  );
}

async function fetchHistoricalMarketData(
  startDate: string,
  endDate: string
): Promise<MarketData[]> {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error('잘못된 백테스트 기간입니다.');
  }

  // 오늘로부터 startDate까지의 일수 계산
  const now = new Date();
  const MILLIS_PER_DAY = 1000 * 60 * 60 * 24;
  const daysFromStartToNow = Math.ceil((now.getTime() - start.getTime()) / MILLIS_PER_DAY);

  // startDate 기준으로 충분한 데이터 가져오기
  const totalDays = Math.max(daysFromStartToNow + BACKTEST.BUFFER_DAYS, BACKTEST.MIN_DAYS);
  const rawData = await MarketDataService.getHistoricalSOXLData(totalDays);

  const startKey = start.toISOString().split('T')[0];
  const endKey = end.toISOString().split('T')[0];

  const filtered = rawData.filter(({ date }) => date >= startKey && date <= endKey);

  if (filtered.length === 0) {
    throw new Error(`${startDate} ~ ${endDate} 기간의 데이터를 찾을 수 없습니다. API에서 제공하는 데이터 범위를 확인해주세요.`);
  }

  return filtered;
}
