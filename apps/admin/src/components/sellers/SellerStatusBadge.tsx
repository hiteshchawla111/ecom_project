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
      className={`inline-flex items-center px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.1em] ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
