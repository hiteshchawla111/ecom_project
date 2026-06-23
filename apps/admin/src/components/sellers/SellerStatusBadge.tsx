import type { SellerStatus } from '../../lib/sellers';

/** Badge styles per status — semantic tint + matching text (never color-only). */
const STYLES: Record<SellerStatus, string> = {
  PENDING_REVIEW: 'bg-warning-500/10 text-warning-500',
  ACTIVE: 'bg-success-500/10 text-success-500',
  SUSPENDED: 'bg-error-500/10 text-error-500',
  DEACTIVATED: 'bg-line text-content-muted',
};

const LABELS: Record<SellerStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DEACTIVATED: 'Deactivated',
};

export function SellerStatusBadge({ status }: { status: SellerStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
