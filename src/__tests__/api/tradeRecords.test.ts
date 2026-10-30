/**
 * @jest-environment node
 */
const query = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query })) }));

import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '@/app/api/db/trade-records/route';

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/db/trade-records', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

const valid = { trade_date: '2026-10-29', division_number: 7, trade_type: 'BUY', quantity: 3, price: 102.4 };

describe('/api/db/trade-records', () => {
  beforeEach(() => query.mockReset());

  it('POST: user_id·amount는 서버가 채운다 (클라이언트 값 무시)', async () => {
    query.mockResolvedValue({ rows: [{ id: 1, price: '102.40', amount: '307.20' }] });
    const res = await post({ ...valid, user_id: 'attacker', amount: 1 });
    expect(res.status).toBe(201);
    const params = query.mock.calls[0][1];
    expect(params[0]).toBe('default_user');
    expect(params[6]).toBeCloseTo(307.2);
    expect(await res.json()).toEqual({ id: 1, price: 102.4, amount: 307.2 });
  });

  it.each([
    ['날짜', { trade_date: '2026/10/29' }],
    ['분할 0', { division_number: 0 }],
    ['매매 구분', { trade_type: 'HOLD' }],
    ['수량 소수', { quantity: 1.5 }],
    ['가격 음수', { price: -1 }],
  ])('POST: %s 오류는 400이고 DB에 쓰지 않는다', async (_, patch) => {
    const res = await post({ ...valid, ...patch });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('GET: 건수 제한 없이 전체를 돌려주고 DECIMAL 문자열을 숫자로 바꾼다', async () => {
    query.mockResolvedValue({ rows: Array.from({ length: 1234 }, (_, i) => ({ id: i, price: '1.50', amount: '3.00' })) });
    const rows = await (await GET()).json();
    expect(rows).toHaveLength(1234);
    expect(rows[0].price).toBe(1.5);
    expect(query.mock.calls[0][0]).not.toMatch(/LIMIT/i);
  });

  it('GET: DB 연결 실패는 알기 쉬운 오류로', async () => {
    query.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('DB에 연결할 수 없습니다');
  });

  it('DELETE: 본인 기록만 지운다', async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await DELETE(new NextRequest('http://localhost/api/db/trade-records?id=5', { method: 'DELETE' }));
    expect(res.status).toBe(204);
    expect(query.mock.calls[0][1]).toEqual([5, 'default_user']);
  });
});
