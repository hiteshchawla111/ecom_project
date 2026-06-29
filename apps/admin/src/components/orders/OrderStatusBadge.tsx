import type { OrderStatus } from '../../lib/orders';

// Order-status colors come from the DESIGN.md semantic mapping. Each badge
// pairs a tint with matching text + a human label — never color alone.
const STYLES: Record<OrderStatus, string> = {
  PENDING: 'bg-warning-500/10 text-warning-500',
  CONFIRMED: 'bg-info-500/10 text-info-500',
  PROCESSING: 'bg-info-500/10 text-info-500',
  SHIPPED: 'bg-primary-500/10 text-primary-700',
  DELIVERED: 'bg-success-500/10 text-success-500',
  CANCELLED: 'bg-error-500/10 text-error-500',
  REFUNDED: 'bg-error-500/10 text-error-500',
};

const LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.1em] ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
