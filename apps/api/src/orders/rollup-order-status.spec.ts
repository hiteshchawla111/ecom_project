import { OrderStatus, SubOrderStatus } from '@prisma/client';
import { rollupOrderStatus } from './rollup-order-status';

const S = SubOrderStatus;
const O = OrderStatus;

describe('rollupOrderStatus', () => {
  it('single suborder rolls up to exactly that status (legacy parity)', () => {
    for (const s of Object.values(S)) {
      expect(rollupOrderStatus([s])).toBe(s as unknown as OrderStatus);
    }
  });

  it('all CANCELLED -> CANCELLED', () => {
    expect(rollupOrderStatus([S.CANCELLED, S.CANCELLED])).toBe(O.CANCELLED);
  });

  it('all REFUNDED -> REFUNDED', () => {
    expect(rollupOrderStatus([S.REFUNDED, S.REFUNDED])).toBe(O.REFUNDED);
  });

  it('least-advanced of the active set wins', () => {
    expect(rollupOrderStatus([S.PENDING, S.SHIPPED])).toBe(O.PENDING);
    expect(rollupOrderStatus([S.CONFIRMED, S.DELIVERED])).toBe(O.CONFIRMED);
    expect(rollupOrderStatus([S.PROCESSING, S.SHIPPED, S.DELIVERED])).toBe(O.PROCESSING);
  });

  it('excludes CANCELLED suborders from the active least-advanced calc', () => {
    expect(rollupOrderStatus([S.CANCELLED, S.PROCESSING])).toBe(O.PROCESSING);
    expect(rollupOrderStatus([S.CANCELLED, S.CANCELLED, S.DELIVERED])).toBe(O.DELIVERED);
  });

  it('ranks REFUNDED above DELIVERED (so a delivered+refunded mix rolls up to DELIVERED)', () => {
    expect(rollupOrderStatus([S.DELIVERED, S.REFUNDED])).toBe(O.DELIVERED);
  });

  it('all DELIVERED -> DELIVERED', () => {
    expect(rollupOrderStatus([S.DELIVERED, S.DELIVERED])).toBe(O.DELIVERED);
  });

  it('empty input -> CANCELLED (guard; no active suborders)', () => {
    expect(rollupOrderStatus([])).toBe(O.CANCELLED);
  });
});
