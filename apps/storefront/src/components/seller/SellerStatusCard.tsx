// src/components/seller/SellerStatusCard.tsx
import type { SellerStatus, SellerView } from '@/lib/seller';

const STATUS_LABEL: Record<SellerStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DEACTIVATED: 'Deactivated',
};

const STATUS_CLASS: Record<SellerStatus, string> = {
  PENDING_REVIEW: 'bg-warning-500/10 text-warning-600',
  ACTIVE: 'bg-success-500/10 text-success-600',
  SUSPENDED: 'bg-error-500/10 text-error-600',
  DEACTIVATED: 'bg-surface-muted text-content-subtle',
};

function kycLine(label: string, present: boolean, detail?: string | null): string {
  if (!present) return `${label} not added`;
  return detail ? `${label} on file ••••${detail}` : `${label} on file`;
}

export function SellerStatusCard({ seller }: { seller: SellerView }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-content-subtle">
            Shop
          </span>
          <span className="text-lg font-semibold text-content">{seller.displayName}</span>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[seller.status]}`}>
          {STATUS_LABEL[seller.status]}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-sm text-content-muted sm:grid-cols-2">
        <dd>{kycLine('PAN', seller.panPresent)}</dd>
        <dd>{kycLine('GSTIN', seller.gstinPresent)}</dd>
        <dd>{kycLine('Bank account', Boolean(seller.bankAccountLast4), seller.bankAccountLast4)}</dd>
        <dd>{kycLine('IFSC', seller.bankIfscPresent)}</dd>
      </dl>
      {seller.status === 'PENDING_REVIEW' ? (
        <p className="text-sm text-content-subtle">
          Your application is under review. You can add or update your tax and bank
          details below while you wait.
        </p>
      ) : null}
    </div>
  );
}
