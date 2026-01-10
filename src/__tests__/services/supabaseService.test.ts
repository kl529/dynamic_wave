import { TradeRecordService } from '@/services/supabaseService';
import { supabase } from '@/lib/supabase';

// Supabase 모킹
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            order: jest.fn(() => ({
              limit: jest.fn(),
            })),
          })),
        })),
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(),
      })),
    })),
  },
  isSupabaseConfigured: true,
}));

describe('TradeRecordService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isConfigured', () => {
    it('should return true when Supabase is configured', () => {
      expect(TradeRecordService.isConfigured()).toBe(true);
    });
  });

  describe('addRecord', () => {
    it('should add a trade record successfully', async () => {
      const mockRecord = {
        id: 1,
        user_id: 'default_user',
        trade_date: '2025-01-10',
        division_number: 1,
        trade_type: 'BUY' as const,
        quantity: 10,
        price: 25.50,
        amount: 255.00,
        comment: '테스트 매수',
        created_at: '2025-01-10T10:00:00Z',
      };

      const mockSingle = jest.fn().mockResolvedValue({ data: mockRecord, error: null });
      const mockSelect = jest.fn(() => ({ single: mockSingle }));
      const mockInsert = jest.fn(() => ({ select: mockSelect }));
      (supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert });

      const result = await TradeRecordService.addRecord({
        user_id: 'default_user',
        trade_date: '2025-01-10',
        division_number: 1,
        trade_type: 'BUY',
        quantity: 10,
        price: 25.50,
        amount: 255.00,
        comment: '테스트 매수',
      });

      expect(result).toEqual(mockRecord);
      expect(supabase.from).toHaveBeenCalledWith('trade_records');
    });

    it('should throw error when insert fails', async () => {
      const mockError = { message: 'Insert failed', code: 'ERROR' };
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: mockError });
      const mockSelect = jest.fn(() => ({ single: mockSingle }));
      const mockInsert = jest.fn(() => ({ select: mockSelect }));
      (supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert });

      await expect(
        TradeRecordService.addRecord({
          user_id: 'default_user',
          trade_date: '2025-01-10',
          division_number: 1,
          trade_type: 'BUY',
          quantity: 10,
          price: 25.50,
          amount: 255.00,
        })
      ).rejects.toEqual(mockError);
    });
  });

  describe('getRecords', () => {
    it('should fetch trade records successfully', async () => {
      const mockRecords = [
        {
          id: 1,
          user_id: 'default_user',
          trade_date: '2025-01-10',
          division_number: 1,
          trade_type: 'BUY',
          quantity: 10,
          price: 25.50,
          amount: 255.00,
        },
        {
          id: 2,
          user_id: 'default_user',
          trade_date: '2025-01-09',
          division_number: 2,
          trade_type: 'SELL',
          quantity: 5,
          price: 30.00,
          amount: 150.00,
        },
      ];

      const mockLimit = jest.fn().mockResolvedValue({ data: mockRecords, error: null });
      const mockOrder2 = jest.fn(() => ({ limit: mockLimit }));
      const mockOrder1 = jest.fn(() => ({ order: mockOrder2 }));
      const mockEq = jest.fn(() => ({ order: mockOrder1 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      const result = await TradeRecordService.getRecords();

      expect(result).toEqual(mockRecords);
      expect(supabase.from).toHaveBeenCalledWith('trade_records');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('user_id', 'default_user');
    });

    it('should return empty array when no records', async () => {
      const mockLimit = jest.fn().mockResolvedValue({ data: null, error: null });
      const mockOrder2 = jest.fn(() => ({ limit: mockLimit }));
      const mockOrder1 = jest.fn(() => ({ order: mockOrder2 }));
      const mockEq = jest.fn(() => ({ order: mockOrder1 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      const result = await TradeRecordService.getRecords();

      expect(result).toEqual([]);
    });
  });

  describe('deleteRecord', () => {
    it('should delete a trade record successfully', async () => {
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      const mockDelete = jest.fn(() => ({ eq: mockEq }));
      (supabase.from as jest.Mock).mockReturnValue({ delete: mockDelete });

      await TradeRecordService.deleteRecord(1);

      expect(supabase.from).toHaveBeenCalledWith('trade_records');
      expect(mockEq).toHaveBeenCalledWith('id', 1);
    });

    it('should throw error when delete fails', async () => {
      const mockError = { message: 'Delete failed', code: 'ERROR' };
      const mockEq = jest.fn().mockResolvedValue({ error: mockError });
      const mockDelete = jest.fn(() => ({ eq: mockEq }));
      (supabase.from as jest.Mock).mockReturnValue({ delete: mockDelete });

      await expect(TradeRecordService.deleteRecord(1)).rejects.toEqual(mockError);
    });
  });
});
