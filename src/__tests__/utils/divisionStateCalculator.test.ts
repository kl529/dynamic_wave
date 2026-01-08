import { calculateDivisionStates } from '@/utils/divisionStateCalculator';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: mockLocalStorage });

describe('divisionStateCalculator', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
  });

  describe('calculateDivisionStates with no trade records', () => {
    it('should return 5 divisions by default', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      const states = calculateDivisionStates(10000, 5);
      
      expect(states).toHaveLength(5);
    });

    it('should distribute initial capital equally', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      const states = calculateDivisionStates(10000, 5);
      
      states.forEach(state => {
        expect(state.cash).toBe(2000); // 10000 / 5
      });
    });

    it('should initialize all divisions as EMPTY', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      const states = calculateDivisionStates(10000, 5);
      
      states.forEach(state => {
        expect(state.status).toBe('EMPTY');
        expect(state.holdings).toBe(0);
        expect(state.avgPrice).toBe(0);
        expect(state.buyDate).toBeNull();
      });
    });

    it('should use default config when no parameters provided', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      const states = calculateDivisionStates();
      
      expect(states).toHaveLength(5); // DEFAULT_CONFIG.divisions
      states.forEach(state => {
        expect(state.cash).toBe(2000); // 10000 / 5
      });
    });
  });

  describe('calculateDivisionStates with BUY records', () => {
    it('should process a single BUY record', () => {
      const records = [
        {
          id: 1,
          date: '2025-01-05',
          division: 1,
          action: 'BUY' as const,
          quantity: 10,
          price: 100,
          amount: 1000,
          comment: 'test buy',
          createdAt: '2025-01-05T10:00:00Z'
        }
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(records));
      
      const states = calculateDivisionStates(10000, 5);
      
      // Division 1 should have holdings
      expect(states[0].holdings).toBe(10);
      expect(states[0].avgPrice).toBe(100);
      expect(states[0].cash).toBe(1000); // 2000 - 1000
      expect(states[0].status).toBe('HOLDING');
      expect(states[0].buyDate).toBe('2025-01-05');
      
      // Other divisions should be empty
      for (let i = 1; i < 5; i++) {
        expect(states[i].status).toBe('EMPTY');
        expect(states[i].cash).toBe(2000);
      }
    });

    it('should calculate correct average price for multiple buys', () => {
      const records = [
        {
          id: 1,
          date: '2025-01-05',
          division: 1,
          action: 'BUY' as const,
          quantity: 10,
          price: 100,
          amount: 1000,
          comment: 'first buy',
          createdAt: '2025-01-05T10:00:00Z'
        },
        {
          id: 2,
          date: '2025-01-06',
          division: 1,
          action: 'BUY' as const,
          quantity: 10,
          price: 120,
          amount: 1200,
          comment: 'second buy',
          createdAt: '2025-01-06T10:00:00Z'
        }
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(records));
      
      const states = calculateDivisionStates(10000, 5);
      
      // Total: 20 shares, total cost: 2200
      expect(states[0].holdings).toBe(20);
      expect(states[0].avgPrice).toBe(110); // (1000 + 1200) / 20
      expect(states[0].totalCost).toBe(2200);
    });
  });

  describe('calculateDivisionStates with SELL records', () => {
    it('should process a full sell', () => {
      const records = [
        {
          id: 1,
          date: '2025-01-05',
          division: 1,
          action: 'BUY' as const,
          quantity: 10,
          price: 100,
          amount: 1000,
          comment: 'buy',
          createdAt: '2025-01-05T10:00:00Z'
        },
        {
          id: 2,
          date: '2025-01-10',
          division: 1,
          action: 'SELL' as const,
          quantity: 10,
          price: 110,
          amount: 1100,
          comment: 'sell',
          createdAt: '2025-01-10T10:00:00Z'
        }
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(records));
      
      const states = calculateDivisionStates(10000, 5);
      
      // Division 1 should be back to empty
      expect(states[0].status).toBe('EMPTY');
      expect(states[0].holdings).toBe(0);
      expect(states[0].avgPrice).toBe(0);
      expect(states[0].buyDate).toBeNull();
      expect(states[0].cash).toBe(2100); // 2000 - 1000 + 1100
    });

    it('should process a partial sell', () => {
      const records = [
        {
          id: 1,
          date: '2025-01-05',
          division: 1,
          action: 'BUY' as const,
          quantity: 10,
          price: 100,
          amount: 1000,
          comment: 'buy',
          createdAt: '2025-01-05T10:00:00Z'
        },
        {
          id: 2,
          date: '2025-01-10',
          division: 1,
          action: 'SELL' as const,
          quantity: 5,
          price: 110,
          amount: 550,
          comment: 'partial sell',
          createdAt: '2025-01-10T10:00:00Z'
        }
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(records));
      
      const states = calculateDivisionStates(10000, 5);
      
      // Division 1 should still be holding
      expect(states[0].status).toBe('HOLDING');
      expect(states[0].holdings).toBe(5);
      expect(states[0].avgPrice).toBe(100); // Original avg price maintained
      expect(states[0].cash).toBe(1550); // 2000 - 1000 + 550
    });
  });

  describe('calculateDivisionStates edge cases', () => {
    it('should handle invalid division numbers gracefully', () => {
      const records = [
        {
          id: 1,
          date: '2025-01-05',
          division: 0, // Invalid
          action: 'BUY' as const,
          quantity: 10,
          price: 100,
          amount: 1000,
          comment: 'buy',
          createdAt: '2025-01-05T10:00:00Z'
        },
        {
          id: 2,
          date: '2025-01-05',
          division: 10, // Out of range
          action: 'BUY' as const,
          quantity: 10,
          price: 100,
          amount: 1000,
          comment: 'buy',
          createdAt: '2025-01-05T10:00:00Z'
        }
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(records));
      
      const states = calculateDivisionStates(10000, 5);
      
      // All divisions should remain empty
      states.forEach(state => {
        expect(state.status).toBe('EMPTY');
        expect(state.cash).toBe(2000);
      });
    });

    it('should handle invalid JSON in localStorage', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');
      
      const states = calculateDivisionStates(10000, 5);
      
      expect(states).toHaveLength(5);
      states.forEach(state => {
        expect(state.status).toBe('EMPTY');
      });
    });

    it('should sort records by date before processing', () => {
      const records = [
        {
          id: 2,
          date: '2025-01-10',
          division: 1,
          action: 'SELL' as const,
          quantity: 10,
          price: 110,
          amount: 1100,
          comment: 'sell',
          createdAt: '2025-01-10T10:00:00Z'
        },
        {
          id: 1,
          date: '2025-01-05',
          division: 1,
          action: 'BUY' as const,
          quantity: 10,
          price: 100,
          amount: 1000,
          comment: 'buy',
          createdAt: '2025-01-05T10:00:00Z'
        }
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(records));
      
      const states = calculateDivisionStates(10000, 5);
      
      // Should process buy first, then sell - resulting in empty
      expect(states[0].status).toBe('EMPTY');
      expect(states[0].cash).toBe(2100);
    });
  });
});
