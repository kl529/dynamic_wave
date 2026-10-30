import { NextRequest, NextResponse } from 'next/server';

// 앱이 쓰는 종목만 허용 (임의 심볼로 프록시를 쓰지 못하게)
const ALLOWED_SYMBOLS = new Set(['SOXL', '^NDX', 'QLD', 'QQQ', 'TQQQ', 'SPY']);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'SOXL';
  const days = Number(/^(\d{1,5})d$/.exec(searchParams.get('period') || '90d')?.[1]);

  if (!ALLOWED_SYMBOLS.has(symbol) || !days) {
    return NextResponse.json({ error: 'Unsupported symbol or period' }, { status: 400 });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${days}d&interval=1d`;

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
        'Cache-Control': 'private, max-age=30',
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
