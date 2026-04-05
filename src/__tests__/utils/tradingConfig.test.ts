import {
  FEES,
  getTotalFeeRate,
  getModeConfig,
  calculateTradingDays,
  calculateCommission,
} from '@/utils/tradingConfig';

describe('tradingConfig', () => {
  describe('FEES', () => {
    it('should have correct commission rate', () => {
      expect(FEES.commission).toBe(0.00044);
    });

    it('should have correct SEC fee rate', () => {
      expect(FEES.secFee).toBe(0.0000278);
    });
  });

  describe('getTotalFeeRate', () => {
    it('should return sum of commission and SEC fee', () => {
      const expected = FEES.commission + FEES.secFee;
      expect(getTotalFeeRate()).toBeCloseTo(expected, 10);
    });

    it('should return approximately 0.047%', () => {
      expect(getTotalFeeRate()).toBeCloseTo(0.0004678, 7);
    });
  });

  describe('getModeConfig', () => {
    describe('safe mode', () => {
      const config = getModeConfig('safe');

      it('should have 0.5% sell target', () => {
        expect(config.sellTarget).toBe(0.005);
      });

      it('should have -3% buy target (drop threshold)', () => {
        expect(config.buyTarget).toBe(-0.03);
      });

      it('should have 30 holding days', () => {
        expect(config.holdingDays).toBe(30);
      });

      it('should have 80% profit reinvest', () => {
        expect(config.profitReinvest).toBe(0.8);
      });

      it('should have 30% loss reinvest', () => {
        expect(config.lossReinvest).toBe(0.3);
      });
    });

    describe('aggressive mode', () => {
      const config = getModeConfig('aggressive');

      it('should have 2.5% sell target', () => {
        expect(config.sellTarget).toBe(0.025);
      });

      it('should have -5% buy target (drop threshold)', () => {
        expect(config.buyTarget).toBe(-0.05);
      });

      it('should have 10 holding days', () => {
        expect(config.holdingDays).toBe(10);
      });

      it('should have 80% profit reinvest', () => {
        expect(config.profitReinvest).toBe(0.8);
      });

      it('should have 30% loss reinvest', () => {
        expect(config.lossReinvest).toBe(0.3);
      });
    });
  });

  describe('calculateTradingDays', () => {
    it('should count only weekdays', () => {
      // 2026-01-05 (월) ~ 2026-01-09 (금) = 5 거래일
      const days = calculateTradingDays('2026-01-05', '2026-01-09');
      expect(days).toBe(5);
    });

    it('should exclude weekends', () => {
      // 2026-01-05 (월) ~ 2026-01-12 (월) = 6 거래일 (주말 2일 제외)
      const days = calculateTradingDays('2026-01-05', '2026-01-12');
      expect(days).toBe(6);
    });

    it('should return 1 for same day (weekday)', () => {
      // 2026-01-05 (월)
      const days = calculateTradingDays('2026-01-05', '2026-01-05');
      expect(days).toBe(1);
    });

    it('should return 0 for weekend day', () => {
      // 2026-01-03 (토) ~ 2026-01-04 (일) = 0 거래일
      const days = calculateTradingDays('2026-01-03', '2026-01-04');
      expect(days).toBe(0);
    });

    it('should handle two weeks correctly', () => {
      // 2026-01-05 (월) ~ 2026-01-16 (금) = 10 거래일
      const days = calculateTradingDays('2026-01-05', '2026-01-16');
      expect(days).toBe(10);
    });
  });

  describe('calculateCommission', () => {
    it('should calculate commission for $1000', () => {
      const commission = calculateCommission(1000);
      expect(commission).toBeCloseTo(1000 * getTotalFeeRate(), 5);
    });

    it('should return 0 for $0', () => {
      expect(calculateCommission(0)).toBe(0);
    });

    it('should handle large amounts', () => {
      const amount = 100000;
      const expected = amount * getTotalFeeRate();
      expect(calculateCommission(amount)).toBeCloseTo(expected, 5);
    });
  });
});
