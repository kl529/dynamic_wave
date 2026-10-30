import { TradeRecordService } from '@/services/supabaseService';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const ok = (status: number, body?: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

describe('TradeRecordService (서버 라우트 경유)', () => {
  beforeEach(() => mockFetch.mockReset());

  it('addRecord: POST /api/db/trade-records 로 보내고 저장된 레코드를 돌려준다', async () => {
    const saved = { id: 1, user_id: 'default_user', trade_date: '2026-10-29', division_number: 1, trade_type: 'BUY', quantity: 10, price: 25.5, amount: 255 };
    mockFetch.mockResolvedValue(ok(201, saved));

    const result = await TradeRecordService.addRecord({ trade_date: '2026-10-29', division_number: 1, trade_type: 'BUY', quantity: 10, price: 25.5 });

    expect(result).toEqual(saved);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/db/trade-records');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ trade_date: '2026-10-29', division_number: 1, trade_type: 'BUY', quantity: 10, price: 25.5 });
  });

  it('getRecords: GET /api/db/trade-records', async () => {
    mockFetch.mockResolvedValue(ok(200, []));
    await expect(TradeRecordService.getRecords()).resolves.toEqual([]);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/db/trade-records');
  });

  it('deleteRecord: DELETE /api/db/trade-records?id=', async () => {
    mockFetch.mockResolvedValue(ok(204));
    await TradeRecordService.deleteRecord(7);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/db/trade-records?id=7');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('서버 오류 메시지를 그대로 던진다', async () => {
    mockFetch.mockResolvedValue(ok(500, { error: 'DB에 연결할 수 없습니다' }));
    await expect(TradeRecordService.getRecords()).rejects.toThrow('DB에 연결할 수 없습니다');
  });
});
