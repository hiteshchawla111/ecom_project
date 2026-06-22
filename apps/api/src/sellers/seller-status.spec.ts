import { SellerStatus } from '@prisma/client';
import {
  canTransition,
  assertTransition,
  InvalidSellerTransitionError,
} from './seller-status';

describe('seller status transition guard', () => {
  describe('valid transitions', () => {
    it('allows PENDING_REVIEW → ACTIVE (approve)', () => {
      expect(
        canTransition(SellerStatus.PENDING_REVIEW, SellerStatus.ACTIVE),
      ).toBe(true);
    });

    it('allows PENDING_REVIEW → SUSPENDED (reject-at-review)', () => {
      expect(
        canTransition(SellerStatus.PENDING_REVIEW, SellerStatus.SUSPENDED),
      ).toBe(true);
    });

    it('allows ACTIVE → SUSPENDED (suspend)', () => {
      expect(canTransition(SellerStatus.ACTIVE, SellerStatus.SUSPENDED)).toBe(
        true,
      );
    });

    it('allows ACTIVE → DEACTIVATED (offboard)', () => {
      expect(canTransition(SellerStatus.ACTIVE, SellerStatus.DEACTIVATED)).toBe(
        true,
      );
    });

    it('allows SUSPENDED → ACTIVE (reinstate)', () => {
      expect(canTransition(SellerStatus.SUSPENDED, SellerStatus.ACTIVE)).toBe(
        true,
      );
    });

    it('allows SUSPENDED → DEACTIVATED (offboard)', () => {
      expect(
        canTransition(SellerStatus.SUSPENDED, SellerStatus.DEACTIVATED),
      ).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it('rejects PENDING_REVIEW → DEACTIVATED (must go via ACTIVE or SUSPENDED)', () => {
      expect(
        canTransition(SellerStatus.PENDING_REVIEW, SellerStatus.DEACTIVATED),
      ).toBe(false);
    });

    it('rejects same-state no-op: ACTIVE → ACTIVE', () => {
      expect(canTransition(SellerStatus.ACTIVE, SellerStatus.ACTIVE)).toBe(
        false,
      );
    });

    it('rejects same-state no-op: PENDING_REVIEW → PENDING_REVIEW', () => {
      expect(
        canTransition(SellerStatus.PENDING_REVIEW, SellerStatus.PENDING_REVIEW),
      ).toBe(false);
    });

    it('rejects DEACTIVATED → ACTIVE (terminal state)', () => {
      expect(canTransition(SellerStatus.DEACTIVATED, SellerStatus.ACTIVE)).toBe(
        false,
      );
    });

    it('rejects DEACTIVATED → SUSPENDED (terminal state)', () => {
      expect(
        canTransition(SellerStatus.DEACTIVATED, SellerStatus.SUSPENDED),
      ).toBe(false);
    });

    it('rejects DEACTIVATED → PENDING_REVIEW (terminal state)', () => {
      expect(
        canTransition(SellerStatus.DEACTIVATED, SellerStatus.PENDING_REVIEW),
      ).toBe(false);
    });

    it('rejects ACTIVE → PENDING_REVIEW (no going back to review)', () => {
      expect(
        canTransition(SellerStatus.ACTIVE, SellerStatus.PENDING_REVIEW),
      ).toBe(false);
    });

    it('rejects transition from an unknown status (defensive)', () => {
      expect(canTransition('BOGUS' as SellerStatus, SellerStatus.ACTIVE)).toBe(
        false,
      );
    });
  });

  describe('assertTransition', () => {
    it('does not throw on a valid transition', () => {
      expect(() =>
        assertTransition(SellerStatus.PENDING_REVIEW, SellerStatus.ACTIVE),
      ).not.toThrow();
    });

    it('does not throw on SUSPENDED → ACTIVE (reinstate)', () => {
      expect(() =>
        assertTransition(SellerStatus.SUSPENDED, SellerStatus.ACTIVE),
      ).not.toThrow();
    });

    it('throws InvalidSellerTransitionError on an invalid transition', () => {
      expect(() =>
        assertTransition(SellerStatus.DEACTIVATED, SellerStatus.ACTIVE),
      ).toThrow(InvalidSellerTransitionError);
    });

    it('error message names both states', () => {
      expect(() =>
        assertTransition(SellerStatus.DEACTIVATED, SellerStatus.ACTIVE),
      ).toThrow(/DEACTIVATED.*ACTIVE/);
    });

    it('throws on same-state no-op', () => {
      expect(() =>
        assertTransition(SellerStatus.ACTIVE, SellerStatus.ACTIVE),
      ).toThrow(InvalidSellerTransitionError);
    });

    it('throws on PENDING_REVIEW → DEACTIVATED (skipping steps)', () => {
      expect(() =>
        assertTransition(SellerStatus.PENDING_REVIEW, SellerStatus.DEACTIVATED),
      ).toThrow(InvalidSellerTransitionError);
    });
  });
});
