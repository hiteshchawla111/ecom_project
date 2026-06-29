import type { ProductStatus } from '../../lib/products';

/** Badge styles per status — semantic tint + matching text (never color-only). */
const STYLES: Record<ProductStatus, string> = {
  ACTIVE: 'bg-success-500/10 text-success-500',
  INACTIVE: 'bg-warning-500/10 text-warning-500',
  ARCHIVED: 'bg-line text-content-muted',
};

const LABELS: Record<ProductStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  ARCHIVED: 'Archived',
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.1em] ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
