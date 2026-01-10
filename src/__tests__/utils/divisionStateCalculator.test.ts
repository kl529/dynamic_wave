import {
  createInitialDivisionStates,
  calculateDivisionStatesFromRecords
} from '@/utils/divisionStateCalculator';
import { TradeRecord } from '@/lib/supabase';

describe('divisionStateCalculator', () => {
  describe('createInitialDivisionStates', () => {
    it('should return 5 divisions by default', () => {
      const states = createInitialDivisionStates(10000, 5);

      expect(states).toHaveLength(5);
    });

    it('should distribute initial capital equally', () => {
      const states = createInitialDivisionStates(10000, 5);

      states.forEach(state => {
        expect(state.cash).toBe(2000); // 10000 / 5
      });
    });

    it('should initialize all divisions as EMPTY', () => {
      const states = createInitialDivisionStates(10000, 5);

      states.forEach(state => {
        expect(state.status).toBe('EMPTY');
        expect(state.holdings).toBe(0);
        expect(state.avgPrice).toBe(0);
        expect(state.buyDate).toBeNull();
      });
    });

    it('should use default config when no parameters provided', () => {
      const states = createInitialDivisionStates();

      expect(states).toHaveLength(5); // DEFAULT_CONFIG.divisions
      states.forEach(state => {
        expect(state.cash).toBe(2000); // 10000 / 5
      });
    });
  });

  describe('calculateDivisionStatesFromRecords with empty records', () => {
    it('should return initial states when records are empty', () => {
      const states = calculateDivisionStatesFromRecords([], 10000, 5);

      expect(states).toHaveLength(5);
      states.forEach(state => {
        expect(state.status).toBe('EMPTY');
        expect(state.cash).toBe(2000);
      });
    });

    it('should handle null records', () => {
      const states = calculateDivisionStatesFromRecords(null as any, 10000, 5);

      expect(states).toHaveLength(5);
      states.forEach(state => {
        expect(state.status).toBe('EMPTY');
      });
    });
  });

  describe('calculateDivisionStatesFromRecords with BUY records', () => {
    it('should process a single BUY record', () => {
      const records: TradeRecord[] = [
        {
          id: 1,
          user_id: 'default_user',
          trade_date: '2025-01-05',
          division_number: 1,
          trade_type: 'BUY',
          quantity: 10,
          price: 100,
          amount: 1000,
        }
      ];

      const states = calculateDivisionStatesFromRecords(records, 10000, 5);

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
      const records: TradeRecord[] = [
        {
          id: 1,
          user_id: 'default_user',
          trade_date: '2025-01-05',
          division_number: 1,
          trade_type: 'BUY',
          quantity: 10,
          price: 100,
          amount: 1000,
        },
        {
          id: 2,
          user_id: 'default_user',
          trade_date: '2025-01-06',
          division_number: 1,
          trade_type: 'BUY',
          quantity: 10,
          price: 120,
          amount: 1200,
        }
      ];

      const states = calculateDivisionStatesFromRecords(records, 10000, 5);

      // Total: 20 shares, total cost: 2200
      expect(states[0].holdings).toBe(20);
      expect(states[0].avgPrice).toBe(110); // (1000 + 1200) / 20
      expect(states[0].totalCost).toBe(2200);
    });
  });

  describe('calculateDivisionStatesFromRecords with SELL records', () => {
    it('should process a full sell', () => {
      const records: TradeRecord[] = [
        {
          id: 1,
          user_id: 'default_user',
          trade_date: '2025-01-05',
          division_number: 1,
          trade_type: 'BUY',
          quantity: 10,
          price: 100,
          amount: 1000,
        },
        {
          id: 2,
          user_id: 'default_user',
          trade_date: '2025-01-10',
          division_number: 1,
          trade_type: 'SELL',
          quantity: 10,
          price: 110,
          amount: 1100,
        }
      ];

      const states = calculateDivisionStatesFromRecords(records, 10000, 5);

      // Division 1 should be back to empty
      expect(states[0].status).toBe('EMPTY');
      expect(states[0].holdings).toBe(0);
      expect(states[0].avgPrice).toBe(0);
      expect(states[0].buyDate).toBeNull();
      expect(states[0].cash).toBe(2100); // 2000 - 1000 + 1100
    });

    it('should process a partial sell', () => {
      const records: TradeRecord[] = [
        {
          id: 1,
          user_id: 'default_user',
          trade_date: '2025-01-05',
          division_number: 1,
          trade_type: 'BUY',
          quantity: 10,
          price: 100,
          amount: 1000,
        },
        {
          id: 2,
          user_id: 'default_user',
          trade_date: '2025-01-10',
          division_number: 1,
          trade_type: 'SELL',
          quantity: 5,
          price: 110,
          amount: 550,
        }
      ];

      const states = calculateDivisionStatesFromRecords(records, 10000, 5);

      // Division 1 should still be holding
      expect(states[0].status).toBe('HOLDING');
      expect(states[0].holdings).toBe(5);
      expect(states[0].avgPrice).toBe(100); // Original avg price maintained
      expect(states[0].cash).toBe(1550); // 2000 - 1000 + 550
    });
  });

  describe('calculateDivisionStatesFromRecords edge cases', () => {
    it('should handle invalid division numbers gracefully', () => {
      const records: TradeRecord[] = [
        {
          id: 1,
          user_id: 'default_user',
          trade_date: '2025-01-05',
          division_number: 0, // Invalid
          trade_type: 'BUY',
          quantity: 10,
          price: 100,
          amount: 1000,
        },
        {
          id: 2,
          user_id: 'default_user',
          trade_date: '2025-01-05',
          division_number: 10, // Out of range
          trade_type: 'BUY',
          quantity: 10,
          price: 100,
          amount: 1000,
        }
      ];

      const states = calculateDivisionStatesFromRecords(records, 10000, 5);

      // All divisions should remain empty
      states.forEach(state => {
        expect(state.status).toBe('EMPTY');
        expect(state.cash).toBe(2000);
      });
    });

    it('should sort records by date before processing', () => {
      const records: TradeRecord[] = [
        {
          id: 2,
          user_id: 'default_user',
          trade_date: '2025-01-10',
          division_number: 1,
          trade_type: 'SELL',
          quantity: 10,
          price: 110,
          amount: 1100,
        },
        {
          id: 1,
          user_id: 'default_user',
          trade_date: '2025-01-05',
          division_number: 1,
          trade_type: 'BUY',
          quantity: 10,
          price: 100,
          amount: 1000,
        }
      ];

      const states = calculateDivisionStatesFromRecords(records, 10000, 5);

      // Should process buy first, then sell - resulting in empty
      expect(states[0].status).toBe('EMPTY');
      expect(states[0].cash).toBe(2100);
    });

    it('should process multiple divisions independently', () => {
      const records: TradeRecord[] = [
        {
          id: 1,
          user_id: 'default_user',
          trade_date: '2025-01-05',
          division_number: 1,
          trade_type: 'BUY',
          quantity: 10,
          price: 100,
          amount: 1000,
        },
        {
          id: 2,
          user_id: 'default_user',
          trade_date: '2025-01-05',
          division_number: 2,
          trade_type: 'BUY',
          quantity: 5,
          price: 90,
          amount: 450,
        }
      ];

      const states = calculateDivisionStatesFromRecords(records, 10000, 5);

      // Division 1
      expect(states[0].holdings).toBe(10);
      expect(states[0].avgPrice).toBe(100);
      expect(states[0].status).toBe('HOLDING');

      // Division 2
      expect(states[1].holdings).toBe(5);
      expect(states[1].avgPrice).toBe(90);
      expect(states[1].status).toBe('HOLDING');

      // Division 3-5 should be empty
      for (let i = 2; i < 5; i++) {
        expect(states[i].status).toBe('EMPTY');
      }
    });
  });
});
