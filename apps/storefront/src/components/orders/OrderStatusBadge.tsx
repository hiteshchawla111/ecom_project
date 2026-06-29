// Order-status colors from the DESIGN.md semantic mapping. Each badge pairs a
// tint with matching text + a human label — never color alone. `status` is a
// plain string (the API serializes the enum); unknown values fall back to a
// neutral badge showing the raw value.
const STYLES: Record<string, string> = {
  PENDING: 'bg-warning-500/10 text-warning-500',
  CONFIRMED: 'bg-info-500/10 text-info-500',
  PROCESSING: 'bg-info-500/10 text-info-500',
  SHIPPED: 'bg-primary-500/10 text-primary-700',
  DELIVERED: 'bg-success-500/10 text-success-500',
  CANCELLED: 'bg-error-500/10 text-error-500',
  REFUNDED: 'bg-error-500/10 text-error-500',
};

const LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export function OrderStatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? 'bg-surface-muted text-content';
  const label = LABELS[status] ?? status;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.1em] ${style}`}
    >
      {label}
    </span>
  );
}
