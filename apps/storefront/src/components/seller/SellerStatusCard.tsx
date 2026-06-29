// src/components/seller/SellerStatusCard.tsx
import type { SellerStatus, SellerView } from '@/lib/seller';

const STATUS_LABEL: Record<SellerStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DEACTIVATED: 'Deactivated',
};

const STATUS_CLASS: Record<SellerStatus, string> = {
  PENDING_REVIEW: 'bg-warning-500/10 text-warning-500',
  ACTIVE: 'bg-success-500/10 text-success-500',
  SUSPENDED: 'bg-error-500/10 text-error-500',
  DEACTIVATED: 'bg-surface-muted text-content-subtle',
};

function kycLine(label: string, present: boolean, detail?: string | null): string {
  if (!present) return `${label} not added`;
  return detail ? `${label} on file ••••${detail}` : `${label} on file`;
}

export function SellerStatusCard({ seller }: { seller: SellerView }) {
  return (
    <div className="flex flex-col gap-6 border border-line bg-surface p-7">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-content-subtle">
            Shop
          </span>
          <span className="font-heading text-2xl font-medium text-content">
            {seller.displayName}
          </span>
        </div>
        <span
          className={`px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.1em] ${STATUS_CLASS[seller.status] ?? 'bg-surface-muted text-content-subtle'}`}
        >
          {STATUS_LABEL[seller.status] ?? seller.status}
        </span>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-px overflow-hidden border border-line bg-line p-0 sm:grid-cols-2">
        <li className="bg-surface p-4 text-sm text-content-muted">
          {kycLine('PAN', seller.panPresent)}
        </li>
        <li className="bg-surface p-4 text-sm text-content-muted">
          {kycLine('GSTIN', seller.gstinPresent)}
        </li>
        <li className="bg-surface p-4 text-sm text-content-muted">
          {kycLine('Bank account', Boolean(seller.bankAccountLast4), seller.bankAccountLast4)}
        </li>
        <li className="bg-surface p-4 text-sm text-content-muted">
          {kycLine('IFSC', seller.bankIfscPresent)}
        </li>
      </ul>
      {seller.status === 'PENDING_REVIEW' ? (
        <p className="flex items-start gap-2 text-sm text-content-subtle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-4 shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4m0 4h.01" />
          </svg>
          Your application is under review. You can add or update your tax and bank
          details below while you wait.
        </p>
      ) : null}
    </div>
  );
}
