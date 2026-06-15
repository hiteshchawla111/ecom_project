import {
  OrderStatus,
  canTransition,
  assertTransition,
  InvalidOrderTransitionError,
} from './order-status';

describe('order status transition guard', () => {
  describe('valid transitions', () => {
    it('allows Pending → Confirmed', () => {
      expect(canTransition(OrderStatus.Pending, OrderStatus.Confirmed)).toBe(
        true,
      );
    });

    it('allows Confirmed → Processing', () => {
      expect(canTransition(OrderStatus.Confirmed, OrderStatus.Processing)).toBe(
        true,
      );
    });

    it('allows Processing → Shipped', () => {
      expect(canTransition(OrderStatus.Processing, OrderStatus.Shipped)).toBe(
        true,
      );
    });

    it('allows Shipped → Delivered', () => {
      expect(canTransition(OrderStatus.Shipped, OrderStatus.Delivered)).toBe(
        true,
      );
    });

    it('allows Pending → Cancelled', () => {
      expect(canTransition(OrderStatus.Pending, OrderStatus.Cancelled)).toBe(
        true,
      );
    });

    it('allows Confirmed → Cancelled', () => {
      expect(canTransition(OrderStatus.Confirmed, OrderStatus.Cancelled)).toBe(
        true,
      );
    });

    it('allows Delivered → Refunded (post-payment)', () => {
      expect(canTransition(OrderStatus.Delivered, OrderStatus.Refunded)).toBe(
        true,
      );
    });
  });

  describe('invalid transitions', () => {
    it('rejects Shipped → Pending (no going back)', () => {
      expect(canTransition(OrderStatus.Shipped, OrderStatus.Pending)).toBe(
        false,
      );
    });

    it('rejects Pending → Delivered (cannot skip steps)', () => {
      expect(canTransition(OrderStatus.Pending, OrderStatus.Delivered)).toBe(
        false,
      );
    });

    it('rejects transition out of a terminal state (Delivered → Shipped)', () => {
      expect(canTransition(OrderStatus.Delivered, OrderStatus.Shipped)).toBe(
        false,
      );
    });

    it('rejects Cancelled → anything (terminal)', () => {
      expect(canTransition(OrderStatus.Cancelled, OrderStatus.Confirmed)).toBe(
        false,
      );
    });

    it('rejects a no-op transition to the same status', () => {
      expect(canTransition(OrderStatus.Pending, OrderStatus.Pending)).toBe(
        false,
      );
    });

    it('rejects transition from an unknown status (defensive)', () => {
      expect(canTransition('Bogus' as OrderStatus, OrderStatus.Confirmed)).toBe(
        false,
      );
    });
  });

  describe('assertTransition', () => {
    it('does not throw on a valid transition', () => {
      expect(() =>
        assertTransition(OrderStatus.Pending, OrderStatus.Confirmed),
      ).not.toThrow();
    });

    it('throws InvalidOrderTransitionError on an invalid transition', () => {
      expect(() =>
        assertTransition(OrderStatus.Shipped, OrderStatus.Pending),
      ).toThrow(InvalidOrderTransitionError);
    });

    it('error message names both states', () => {
      expect(() =>
        assertTransition(OrderStatus.Shipped, OrderStatus.Pending),
      ).toThrow(/Shipped.*Pending/);
    });
  });
});
