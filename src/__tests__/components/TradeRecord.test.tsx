import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { TradeRecordForm } from '@/components/TradeRecordForm';
import { TradeRecordList } from '@/components/TradeRecordList';
import { TradeRecordService } from '@/services/supabaseService';

// Supabase 서비스 모킹
jest.mock('@/services/supabaseService', () => ({
  TradeRecordService: {
    addRecord: jest.fn(),
    getRecords: jest.fn(),
    deleteRecord: jest.fn(),
    migrateFromLocalStorage: jest.fn(),
    isConfigured: jest.fn(() => true),
  },
}));

// Ant Design message 모킹
jest.mock('antd', () => {
  const antd = jest.requireActual('antd');
  return {
    ...antd,
    message: {
      success: jest.fn(),
      error: jest.fn(),
    },
  };
});

describe('TradeRecordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render form fields correctly', () => {
    render(<TradeRecordForm />);

    // 이모지가 포함된 텍스트는 정규식으로 검색
    expect(screen.getByText(/매매 기록 입력/)).toBeInTheDocument();
    expect(screen.getByLabelText('날짜')).toBeInTheDocument();
    expect(screen.getByLabelText('수량')).toBeInTheDocument();
    expect(screen.getByLabelText('가격')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /기록 저장/i })).toBeInTheDocument();
  });

  it('should have submit button', () => {
    render(<TradeRecordForm />);

    expect(screen.getByRole('button', { name: /기록 저장/i })).toBeInTheDocument();
  });
});

describe('TradeRecordList', () => {
  const mockRecords = [
    {
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
    },
    {
      id: 2,
      user_id: 'default_user',
      trade_date: '2025-01-09',
      division_number: 2,
      trade_type: 'SELL' as const,
      quantity: 5,
      price: 30.00,
      amount: 150.00,
      comment: null,
      created_at: '2025-01-09T10:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // localStorage 모킹
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
      writable: true,
    });
  });

  it('should render list title', async () => {
    (TradeRecordService.getRecords as jest.Mock).mockResolvedValue(mockRecords);

    await act(async () => {
      render(<TradeRecordList />);
    });

    expect(screen.getByText(/매매 기록 내역/)).toBeInTheDocument();
  });

  it('should call getRecords on mount', async () => {
    (TradeRecordService.getRecords as jest.Mock).mockResolvedValue(mockRecords);

    await act(async () => {
      render(<TradeRecordList />);
    });

    expect(TradeRecordService.getRecords).toHaveBeenCalled();
  });

  it('should refresh data when refreshTrigger changes', async () => {
    (TradeRecordService.getRecords as jest.Mock).mockResolvedValue(mockRecords);

    let rerender: (ui: React.ReactElement) => void;
    await act(async () => {
      const result = render(<TradeRecordList refreshTrigger={0} />);
      rerender = result.rerender;
    });

    expect(TradeRecordService.getRecords).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<TradeRecordList refreshTrigger={1} />);
    });

    expect(TradeRecordService.getRecords).toHaveBeenCalledTimes(2);
  });

  it('should show migration alert when local data exists', async () => {
    (TradeRecordService.getRecords as jest.Mock).mockResolvedValue([]);

    // localStorage에 데이터가 있는 경우
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key) => {
          if (key === 'tradeRecords') {
            return JSON.stringify([{ id: 1, date: '2025-01-01' }]);
          }
          return null;
        }),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
      writable: true,
    });

    await act(async () => {
      render(<TradeRecordList />);
    });

    await waitFor(() => {
      expect(screen.getByText('로컬 데이터 발견')).toBeInTheDocument();
      expect(screen.getByText('데이터 이전')).toBeInTheDocument();
    });
  });

  it('should display BUY trade type as 매수', async () => {
    (TradeRecordService.getRecords as jest.Mock).mockResolvedValue([mockRecords[0]]);

    await act(async () => {
      render(<TradeRecordList />);
    });

    await waitFor(() => {
      expect(screen.getByText('매수')).toBeInTheDocument();
    });
  });

  it('should display SELL trade type as 매도', async () => {
    (TradeRecordService.getRecords as jest.Mock).mockResolvedValue([mockRecords[1]]);

    await act(async () => {
      render(<TradeRecordList />);
    });

    await waitFor(() => {
      expect(screen.getByText('매도')).toBeInTheDocument();
    });
  });

  it('should display division number with tag', async () => {
    (TradeRecordService.getRecords as jest.Mock).mockResolvedValue([mockRecords[0]]);

    await act(async () => {
      render(<TradeRecordList />);
    });

    await waitFor(() => {
      expect(screen.getByText('분할1')).toBeInTheDocument();
    });
  });

  it('should handle empty records', async () => {
    (TradeRecordService.getRecords as jest.Mock).mockResolvedValue([]);

    await act(async () => {
      render(<TradeRecordList />);
    });

    // 빈 상태에서는 테이블에 데이터가 없음
    expect(screen.getByText(/매매 기록 내역/)).toBeInTheDocument();
  });
});
