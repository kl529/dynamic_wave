import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'SOXL';
  const period = searchParams.get('period') || '1d';
  
  try {
    // Yahoo Finance API 호출
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
    
    return NextResponse.json(
      { error: 'Failed to fetch market data' },
      { status: 500 }
    );
  }
}
