import { describe, it, expect } from 'vitest';
import { notificationText, relativeTime } from './notification-messages';

describe('notificationText (staff copy)', () => {
  it('maps staff types to operator copy', () => {
    expect(notificationText('NEW_ORDER', {})).toBe('New order placed');
    expect(notificationText('LOW_STOCK', {})).toBe('Low stock alert');
    expect(notificationText('NEW_REVIEW', {})).toBe('New product review');
    expect(notificationText('SELLER_REGISTERED', {})).toBe('New seller registered');
    expect(notificationText('SELLER_KYC_APPROVED', {})).toBe('Seller KYC approved');
    expect(notificationText('SELLER_KYC_REJECTED', {})).toBe('Seller KYC rejected');
    expect(notificationText('REGISTRATION_CONFIRMATION', {})).toBe('Welcome');
  });
  it('maps customer types a seller might also receive', () => {
    expect(notificationText('ORDER_CONFIRMATION', {})).toBe('Order placed');
    expect(notificationText('SHIPPING_UPDATE', {})).toBe('Order shipped');
    expect(notificationText('DELIVERY_UPDATE', {})).toBe('Order delivered');
  });
  it('falls back for unknown types', () => {
    expect(notificationText('SOMETHING_NEW', {})).toBe('New notification');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-07-08T12:00:00.000Z');
  it('buckets', () => {
    expect(relativeTime('2026-07-08T11:59:30.000Z', now)).toBe('just now');
    expect(relativeTime('2026-07-08T10:00:00.000Z', now)).toBe('2h ago');
    expect(relativeTime('2026-07-05T12:00:00.000Z', now)).toBe('3d ago');
  });
});
