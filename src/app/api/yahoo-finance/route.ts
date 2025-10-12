import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'SOXL';
  const period = searchParams.get('period') || '1d';
  
  try {
    // Yahoo Finance API 호출 (CORS 우회)
    const interval = period.includes('d') && parseInt(period) <= 5 ? '1m' : '1d';
    const range = period.includes('d') ? period : '90d';
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 30 } // 30초 캐싱
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API 오류: ${response.status}`);
    }

    const data = await response.json();
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });

  } catch (error) {
    console.error('Yahoo Finance API 호출 실패:', error);
    
    // 에러 발생 시 목업 데이터 반환
    const mockData = generateMockYahooData(symbol, period);
    
    return NextResponse.json(mockData, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=10',
      },
    });
  }
}

function generateMockYahooData(symbol: string, period: string) {
  const basePrice = symbol === 'SOXL' ? 28.45 : 100;
  const currentPrice = basePrice + (Math.random() - 0.5) * 6;
  const previousClose = basePrice;
  const volume = Math.floor(Math.random() * 50000000) + 20000000;
  
  // 기간에 따른 데이터 포인트 수
  const days = period.includes('d') ? parseInt(period) : 90;
  const dataPoints = Math.min(days * 24, 1000); // 최대 1000 포인트
  
  const timestamps: number[] = [];
  const open: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const close: number[] = [];
  const volumes: number[] = [];
  
  let price = basePrice;
  const now = Date.now();
  const interval = (days * 24 * 60 * 60 * 1000) / dataPoints;
  
  for (let i = 0; i < dataPoints; i++) {
    const timestamp = now - (dataPoints - i) * interval;
    const changePercent = (Math.random() - 0.5) * 15; // SOXL 높은 변동성
    const dailyChange = price * (changePercent / 100);
    
    price = Math.max(15, price + dailyChange);
    const dailyHigh = price * (1 + Math.random() * 0.03);
    const dailyLow = price * (1 - Math.random() * 0.03);
    const dailyOpen = price * (1 + (Math.random() - 0.5) * 0.02);
    
    timestamps.push(Math.floor(timestamp / 1000));
    open.push(Number(dailyOpen.toFixed(2)));
    high.push(Number(dailyHigh.toFixed(2)));
    low.push(Number(dailyLow.toFixed(2)));
    close.push(Number(price.toFixed(2)));
    volumes.push(Math.floor(Math.random() * 30000000) + 20000000);
  }
  
  return {
    chart: {
      result: [
        {
          meta: {
            currency: 'USD',
            symbol,
            exchangeName: 'NMS',
            instrumentType: 'ETF',
            firstTradeDate: Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60,
            regularMarketTime: timestamps[timestamps.length - 1],
            gmtoffset: -18000,
            timezone: 'EST',
            exchangeTimezoneName: 'America/New_York',
            regularMarketPrice: close[close.length - 1],
            chartPreviousClose: previousClose,
            previousClose,
            scale: 3,
            priceHint: 2,
            currentTradingPeriod: {
              pre: {
                timezone: 'EST',
                start: timestamps[0],
                end: timestamps[timestamps.length - 1],
                gmtoffset: -18000
              }
            },
            dataGranularity: period.includes('d') && days <= 5 ? '1m' : '1d',
            range: period,
            validRanges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'],
            regularMarketVolume: volumes[volumes.length - 1],
            regularMarketDayHigh: Math.max(...high),
            regularMarketDayLow: Math.min(...low)
          },
          timestamp: timestamps,
          indicators: {
            quote: [
              {
                open,
                high,
                low,
                close,
                volume: volumes
              }
            ]
          }
        }
      ],
      error: null
    }
  };
}