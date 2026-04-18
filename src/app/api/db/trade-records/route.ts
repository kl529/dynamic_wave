import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST ?? 'postgres',
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? 'jiwon',
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DB ?? 'homelab',
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id') ?? 'default_user';
  const limit = Number(searchParams.get('limit') ?? 100);

  const { rows } = await pool.query(
    'SELECT * FROM trade_records WHERE user_id = $1 ORDER BY trade_date DESC, created_at DESC LIMIT $2',
    [userId, limit]
  );
  // pg 라이브러리는 DECIMAL 컬럼을 문자열로 반환 → 숫자로 변환
  const parsed = rows.map((r) => ({
    ...r,
    price: parseFloat(r.price),
    amount: parseFloat(r.amount),
  }));
  return NextResponse.json(parsed);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { user_id, trade_date, division_number, trade_type, quantity, price, amount, comment } = body;

  const { rows } = await pool.query(
    `INSERT INTO trade_records (user_id, trade_date, division_number, trade_type, quantity, price, amount, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [user_id, trade_date, division_number, trade_type, quantity, price, amount, comment ?? null]
  );
  const r = rows[0];
  return NextResponse.json({ ...r, price: parseFloat(r.price), amount: parseFloat(r.amount) });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await pool.query('DELETE FROM trade_records WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
