import { MarketDataService } from '@/services/marketDataService';

const t = (iso: string) => Date.parse(iso) / 1000;
const response = {
  chart: {
    result: [{
      meta: { currentTradingPeriod: { regular: { start: t('2026-10-30T13:30:00Z'), end: t('2026-10-30T20:00:00Z') } } },
      timestamp: [t('2026-10-28T13:30:00Z'), t('2026-10-29T13:30:00Z'), t('2026-10-30T13:30:00Z')],
      indicators: { quote: [{ close: [0.4567, null, 0.5012] }] },
    }],
  },
};

describe('MarketDataService.parseYahooHistorical', () => {
  it('장중이면 오늘 봉을 버리고, 빈 값은 건너뛰고, 가격은 반올림하지 않는다', () => {
    const rows = MarketDataService.parseYahooHistorical(response, t('2026-10-30T15:00:00Z'));
    expect(rows.map(r => r.date)).toEqual(['2026-10-28']);
    expect(rows[0].price).toBe(0.4567);
  });

  it('장 마감 후에는 오늘 봉을 포함하고 전일 대비를 계산한다', () => {
    const rows = MarketDataService.parseYahooHistorical(response, t('2026-10-30T21:00:00Z'));
    expect(rows.map(r => r.date)).toEqual(['2026-10-28', '2026-10-30']);
    expect(rows[1].changePercent).toBeCloseTo((0.5012 / 0.4567 - 1) * 100, 10);
  });
});
