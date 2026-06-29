import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getSeller,
  updateSellerStatus,
  type SellerView,
  type SellerStatus,
} from '../lib/sellers';
import { nextStatuses } from '../lib/sellerTransitions';
import { SellerStatusBadge } from '../components/sellers/SellerStatusBadge';
import { useConfirm } from '../components/ui/confirm';
import { ApiError } from '../lib/types';

const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

/**
 * The action label, confirmation copy, and UX flags for transitioning to a
 * given seller status.
 *
 * - `destructive`: renders a danger-bordered button (error-500).
 * - `promptReason`: prompts for an optional reason via window.prompt before
 *   calling the API (covers both reject-at-review and suspend-active).
 *
 * PENDING_REVIEW is included for completeness (exhaustive Record) but is never
 * offered as a transition target — no inbound edges point to it.
 */
const ACTION: Record<
  SellerStatus,
  { label: string; confirm: string; destructive: boolean; promptReason: boolean }
> = {
  ACTIVE: {
    label: 'Approve',
    confirm: 'Approve this seller? They will be able to act on the platform.',
    destructive: false,
    promptReason: false,
  },
  SUSPENDED: {
    label: 'Suspend / Reject',
    confirm: 'Suspend (or reject) this seller? They will be blocked from acting.',
    destructive: true,
    promptReason: true,
  },
  DEACTIVATED: {
    label: 'Deactivate',
    confirm: 'Permanently deactivate this seller? This is terminal.',
    destructive: true,
    promptReason: false,
  },
  PENDING_REVIEW: {
    label: 'Move to review',
    confirm: '',
    destructive: false,
    promptReason: false,
  }, // never offered (no transition INTO pending)
};

export function SellerDetailPage() {
  const confirm = useConfirm();
  const { id } = useParams<{ id: string }>();
  const [seller, setSeller] = useState<SellerView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getSeller(id!);
        if (cancelled) return;
        setSeller(res);
        setNotFound(false);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError('Could not load this seller. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, refreshTick]);

  const reload = useCallback(() => setRefreshTick((t) => t + 1), []);

  async function onTransition(next: SellerStatus) {
    if (!seller) return;
    const ok = await confirm({
      title: ACTION[next].label ?? 'Update seller',
      description: ACTION[next].confirm,
      confirmLabel: 'Confirm',
      destructive: next === 'SUSPENDED' || next === 'DEACTIVATED',
    });
    if (!ok) return;
    const reason =
      ACTION[next].promptReason
        ? (window.prompt('Reason (optional):') ?? undefined) || undefined
        : undefined;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateSellerStatus(seller.id, next, reason);
      setSeller(updated);
    } catch {
      setError('The status change could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <p role="status" aria-live="polite" className="text-content-muted">
        Loading…
      </p>
    );
  }

  if (notFound) {
    return (
      <section className="flex flex-col gap-4">
        <p className="text-content-muted">Seller not found.</p>
        <Link to="/sellers" className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-muted transition-colors hover:text-content">
          ← Back to sellers
        </Link>
      </section>
    );
  }

  if (error && !seller) {
    return (
      <section className="flex flex-col gap-4">
        <div
          role="alert"
          className="rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500"
        >
          {error}
        </div>
        <button
          type="button"
          onClick={reload}
          className="self-start rounded-md border border-line px-3 py-1.5 text-xs font-medium text-content hover:bg-surface-muted"
        >
          Try again
        </button>
      </section>
    );
  }

  if (!seller) return null;

  const transitions = nextStatuses(seller.status);

  return (
    <section className="flex flex-col gap-8">
      <div>
        <Link to="/sellers" className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-muted transition-colors hover:text-content">
          ← Back to sellers
        </Link>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-6">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-3xl font-medium tracking-tight text-content">
            {seller.displayName}
          </h2>
          <SellerStatusBadge status={seller.status} />
        </div>
        <p className="text-sm text-content-muted">
          Joined {dateFmt.format(new Date(seller.createdAt))}
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500"
        >
          {error}
        </div>
      )}

      {transitions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {transitions.map((next) => {
            const { label, destructive } = ACTION[next];
            return (
              <button
                key={next}
                type="button"
                disabled={busy}
                onClick={() => void onTransition(next)}
                className={
                  destructive
                    ? 'border border-error-500 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-error-600 transition-colors duration-300 hover:bg-error-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50'
                    : 'bg-primary-600 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors duration-300 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50'
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="border border-line bg-surface p-6">
            <h3 className="mb-4 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-content-subtle">
              Profile
            </h3>
            <dl className="grid gap-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-32 shrink-0 text-content-subtle">Slug</dt>
                <dd className="text-content">{seller.slug}</dd>
              </div>
              {seller.description && (
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-content-subtle">Description</dt>
                  <dd className="text-content">{seller.description}</dd>
                </div>
              )}
              {seller.logoUrl && (
                <div className="flex gap-2">
                  <dt className="w-32 shrink-0 text-content-subtle">Logo URL</dt>
                  <dd className="truncate text-content">{seller.logoUrl}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-32 shrink-0 text-content-subtle">KYC verified</dt>
                <dd className="text-content">
                  {seller.kycVerifiedAt
                    ? dateFmt.format(new Date(seller.kycVerifiedAt))
                    : '—'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-32 shrink-0 text-content-subtle">Created</dt>
                <dd className="text-content">
                  {dateFmt.format(new Date(seller.createdAt))}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* KYC panel — masked only, no raw values */}
        <aside>
          <div className="border border-line bg-surface p-6">
            <h3 className="mb-4 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-content-subtle">
              KYC documents
            </h3>
            <dl className="flex flex-col gap-y-3 text-sm">
              <div>
                <dt className="text-content-subtle">Bank account</dt>
                <dd className="font-medium text-content">
                  {seller.bankAccountLast4 ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-content-subtle">GSTIN</dt>
                <dd className="font-medium text-content">
                  {seller.gstinPresent ? 'Provided' : 'Not provided'}
                </dd>
              </div>
              <div>
                <dt className="text-content-subtle">PAN</dt>
                <dd className="font-medium text-content">
                  {seller.panPresent ? 'Provided' : 'Not provided'}
                </dd>
              </div>
              <div>
                <dt className="text-content-subtle">Bank IFSC</dt>
                <dd className="font-medium text-content">
                  {seller.bankIfscPresent ? 'Provided' : 'Not provided'}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      {transitions.length === 0 && (
        <p className="text-sm text-content-subtle">No actions available.</p>
      )}
    </section>
  );
}
