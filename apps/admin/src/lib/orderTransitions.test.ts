import { describe, it, expect } from 'vitest';
import { nextStatuses } from './orderTransitions';

describe('nextStatuses', () => {
  it('mirrors the API order state machine', () => {
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
