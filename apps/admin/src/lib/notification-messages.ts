/** Operator-facing copy per notification type (staff surface). */
const MESSAGES: Record<string, string> = {
  NEW_ORDER: 'New order placed',
  LOW_STOCK: 'Low stock alert',
  NEW_REVIEW: 'New product review',
  SELLER_REGISTERED: 'New seller registered',
  SELLER_KYC_APPROVED: 'Seller KYC approved',
  SELLER_KYC_REJECTED: 'Seller KYC rejected',
  REGISTRATION_CONFIRMATION: 'Welcome',
  ORDER_CONFIRMATION: 'Order placed',
  SHIPPING_UPDATE: 'Order shipped',
  DELIVERY_UPDATE: 'Order delivered',
};

/** Friendly copy for a notification; unknown types → a safe generic. */
export function notificationText(type: string, _payload: unknown): string {
  return MESSAGES[type] ?? 'New notification';
}

/** Compact relative time. `now` injectable for deterministic tests. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const secs = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
