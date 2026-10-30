import { PERIODS, VOL_WINDOW, limitPrice, orderShares, targetWeights } from '../../../scripts/isa-order';
import { filteredEnsemble } from '@/lib/trend';
import { STRATEGY } from '@/lib/strategy';

// 다른 프로젝트로 복사해 쓰는 단일 파일이 앱 계산과 어긋나지 않는지 확인
describe('scripts/isa-order.ts', () => {
  it('파라미터가 앱 추천 전략과 같다', () => {
    expect(PERIODS).toEqual([...STRATEGY.periods]);
    expect(VOL_WINDOW).toBe(STRATEGY.volWindow);
  });

  it('목표 비중이 앱의 filteredEnsemble 과 모든 날 같다', () => {
    let x = 7, p = 100;
    const closes = Array.from({ length: 1500 }, (_, i) => {
      x = (x * 16807) % 2147483647;
      p *= 1 + ((x / 2147483647) - 0.49) * (i > 1000 ? 0.08 : 0.03); // 뒤쪽은 크게 흔들려 변동성 필터가 작동
      return p;
    });
    const app = filteredEnsemble(closes, [...STRATEGY.periods], STRATEGY.volWindow);
    expect(targetWeights(closes)).toEqual(app);
    expect(new Set(app).size).toBeGreaterThan(3);
  });

  it('주문 수량: 목표가 바뀌거나 10%p 이상 벌어졌을 때만', () => {
    expect(orderShares(0.8, 1, 18935, 0, 10_000_000)).toBe(422);          // 첫 매수
    expect(orderShares(0.8, 0.8, 18935, 422, 2_009_430)).toBe(0);         // 목표 그대로
    expect(orderShares(0.6, 0.8, 18935, 422, 2_009_430)).toBe(-106);      // 80% → 60%
    expect(orderShares(0, 0.2, 18935, 105, 8_000_000)).toBe(-105);        // 전량 매도
    expect(orderShares(1, 0.8, 18935, 0, 10_000_000)).toBe(522);          // 100%: 예수금 ÷ 매수 지정가(19,125) 한도
  });

  it('지정가: 매수 +1% 올림, 매도 -1% 내림, 5원 단위', () => {
    expect(limitPrice(18935, 1)).toBe(19125);
    expect(limitPrice(18935, -1)).toBe(18745);
  });
});
