import { describe, it, expect } from 'vitest';
import { nextStatuses, ACTION } from './subOrderTransitions';

describe('nextStatuses (sub-order)', () => {
  it('mirrors the API state machine', () => {
    expect(nextStatuses('PENDING')).toEqual(['CONFIRMED', 'CANCELLED']);
    expect(nextStatuses('CONFIRMED')).toEqual(['PROCESSING', 'CANCELLED']);
    expect(nextStatuses('PROCESSING')).toEqual(['SHIPPED', 'CANCELLED']);
    expect(nextStatuses('SHIPPED')).toEqual(['DELIVERED']);
    expect(nextStatuses('DELIVERED')).toEqual(['REFUNDED']);
  });

  it('returns no transitions for terminal states', () => {
    expect(nextStatuses('CANCELLED')).toEqual([]);
    expect(nextStatuses('REFUNDED')).toEqual([]);
  });
});

describe('ACTION', () => {
  it('marks CANCELLED and REFUNDED as destructive with confirm copy', () => {
    expect(ACTION.CANCELLED.destructive).toBe(true);
    expect(ACTION.REFUNDED.destructive).toBe(true);
    expect(ACTION.CONFIRMED.destructive).toBeFalsy();
    expect(typeof ACTION.SHIPPED.label).toBe('string');
    expect(typeof ACTION.CANCELLED.confirm).toBe('string');
  });
});
