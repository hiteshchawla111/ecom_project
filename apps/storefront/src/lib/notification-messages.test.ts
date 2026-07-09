import { describe, it, expect } from 'vitest';
import { notificationText, relativeTime } from './notification-messages';

describe('notificationText', () => {
  it('maps customer types to friendly copy', () => {
    expect(notificationText('ORDER_CONFIRMATION', {})).toBe('Your order was placed');
    expect(notificationText('SHIPPING_UPDATE', {})).toBe('Your order has shipped');
    expect(notificationText('DELIVERY_UPDATE', {})).toBe('Your order was delivered');
    expect(notificationText('REGISTRATION_CONFIRMATION', {})).toBe('Welcome to the shop');
  });
  it('falls back for unmapped/staff/unknown types', () => {
    expect(notificationText('NEW_ORDER', {})).toBe('You have a new notification');
    expect(notificationText('SOMETHING_FUTURE', {})).toBe('You have a new notification');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-07-07T12:00:00.000Z');
  it('buckets recent/hours/days', () => {
    expect(relativeTime('2026-07-07T11:59:30.000Z', now)).toBe('just now');
    expect(relativeTime('2026-07-07T10:00:00.000Z', now)).toBe('2h ago');
    expect(relativeTime('2026-07-04T12:00:00.000Z', now)).toBe('3d ago');
  });
});
