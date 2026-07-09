/** API NotificationType mirrored as a string union (storefront must not import @prisma/client). */
export type NotificationTypeStr =
  | 'REGISTRATION_CONFIRMATION' | 'ORDER_CONFIRMATION' | 'SHIPPING_UPDATE'
  | 'DELIVERY_UPDATE' | 'NEW_ORDER' | 'LOW_STOCK' | 'REFUND_REQUEST'
  | 'NEW_REVIEW' | 'SELLER_REGISTERED' | 'SELLER_KYC_APPROVED' | 'SELLER_KYC_REJECTED';

const MESSAGES: Partial<Record<NotificationTypeStr, string>> = {
  ORDER_CONFIRMATION: 'Your order was placed',
  SHIPPING_UPDATE: 'Your order has shipped',
  DELIVERY_UPDATE: 'Your order was delivered',
  REGISTRATION_CONFIRMATION: 'Welcome to the shop',
};

/** Friendly copy for a notification. Unknown/staff types → a safe generic. */
export function notificationText(type: string, _payload: unknown): string {
  return MESSAGES[type as NotificationTypeStr] ?? 'You have a new notification';
}

/** Compact relative time. `now` injectable for deterministic tests. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
