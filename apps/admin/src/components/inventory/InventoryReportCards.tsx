import { StatCard } from '../ui/StatCard';
import type { InventoryReport } from '../../lib/inventory';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export interface InventoryReportCardsProps {
  /** The fetched report, or null while loading / on error. */
  report: InventoryReport | null;
  loading: boolean;
  error: string | null;
}

/**
 * Presentational grid of aggregate inventory metrics. The valuation is a
 * money string from the API; we only format it for display (never recompute).
 * Loading/error states are passed in so the page owns the fetch.
 */
export function InventoryReportCards({
  report,
  loading,
  error,
}: InventoryReportCardsProps) {
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500"
      >
        {error}
      </div>
    );
  }

  if (loading || !report) {
    return (
      <p role="status" aria-live="polite" className="text-content-muted">
        Loading…
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="Total products" value={String(report.totalProducts)} />
      <StatCard
        label="Available units"
        value={String(report.totalAvailable)}
      />
      <StatCard label="Reserved units" value={String(report.totalReserved)} />
      <StatCard label="Low stock" value={String(report.lowStockCount)} />
      <StatCard label="Out of stock" value={String(report.outOfStockCount)} />
      <StatCard
        label="Inventory valuation"
        value={usd.format(Number(report.valuation))}
      />
    </div>
  );
}
