import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import type { TradeRecord } from '@/lib/supabase';

// 미들웨어가 로그인 쿠키를 확인한 요청만 여기 도달한다.
export const dynamic = 'force-dynamic';

const USER_ID = 'default_user';

let pool: Pool | null = null;
const db = () =>
  (pool ??= new Pool({
    host: process.env.PG_HOST ?? 'postgres',
    port: Number(process.env.PG_PORT ?? 5432),
    user: process.env.PG_USER ?? 'jiwon',
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DB ?? 'homelab',
  }));

// pg 라이브러리는 DECIMAL 컬럼을 문자열로 반환 → 숫자로 변환
const toRecord = (r: Record<string, unknown>) => ({ ...r, price: parseFloat(String(r.price)), amount: parseFloat(String(r.amount)) });

const fail = (e: unknown, status = 500) => {
  const message = e instanceof Error ? e.message : String(e);
  const friendly = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|timeout/i.test(message) ? 'DB에 연결할 수 없습니다' : message;
  return NextResponse.json({ error: friendly }, { status });
};

/** 입력 검증: 형식이 맞지 않으면 오류 메시지, 맞으면 저장할 레코드 (user_id·amount는 서버가 정한다) */
function parseRecord(body: unknown): Omit<TradeRecord, 'id' | 'created_at'> | string {
  const r = (body ?? {}) as Record<string, unknown>;
  if (typeof r.trade_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.trade_date)) return '날짜 형식 오류';
  if (!Number.isInteger(r.division_number) || (r.division_number as number) < 1 || (r.division_number as number) > 50) return '분할 번호 오류';
  if (r.trade_type !== 'BUY' && r.trade_type !== 'SELL') return '매매 구분 오류';
  if (!Number.isInteger(r.quantity) || (r.quantity as number) <= 0) return '수량 오류';
  if (typeof r.price !== 'number' || !(r.price > 0)) return '가격 오류';
  if (r.comment != null && (typeof r.comment !== 'string' || r.comment.length > 500)) return '메모 오류';
  return {
    user_id: USER_ID,
    trade_date: r.trade_date,
    division_number: r.division_number as number,
    trade_type: r.trade_type,
    quantity: r.quantity as number,
    price: r.price,
    amount: (r.quantity as number) * r.price,
    comment: (r.comment as string | null | undefined) ?? null,
  };
}

/** 전체 기록 (최근순). 분할 상태는 모든 기록으로 다시 계산하므로 건수 제한을 두지 않는다 */
export async function GET() {
  try {
    const { rows } = await db().query(
      'SELECT * FROM trade_records WHERE user_id = $1 ORDER BY trade_date DESC, created_at DESC, id DESC',
      [USER_ID]
    );
    return NextResponse.json(rows.map(toRecord));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: NextRequest) {
  const record = parseRecord(await request.json().catch(() => null));
  if (typeof record === 'string') return NextResponse.json({ error: record }, { status: 400 });
  try {
    const { rows } = await db().query(
      `INSERT INTO trade_records (user_id, trade_date, division_number, trade_type, quantity, price, amount, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [record.user_id, record.trade_date, record.division_number, record.trade_type, record.quantity, record.price, record.amount, record.comment]
    );
    return NextResponse.json(toRecord(rows[0]), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(request: NextRequest) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'id 오류' }, { status: 400 });
  try {
    await db().query('DELETE FROM trade_records WHERE id = $1 AND user_id = $2', [id, USER_ID]);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return fail(e);
  }
}
