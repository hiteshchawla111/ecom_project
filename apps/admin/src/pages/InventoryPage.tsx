import { useEffect, useState } from 'react';
import { listStock, type StockRow } from '../lib/inventory';
import { Pagination } from '../components/ui/Pagination';

const PAGE_SIZE = 20;

/** Low-stock pill — semantic tint + text (never color-only). */
function LowStockBadge({ low }: { low: boolean }) {
  if (!low) {
    return <span className="text-xs text-neutral-400">OK</span>;
  }
  return (
    <span className="inline-flex items-center rounded-full bg-warning-500/10 px-2.5 py-0.5 text-xs font-medium text-warning-500">
      Low
    </span>
  );
}

export function InventoryPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [page, setPage] = useState(1);
  const [lowStock, setLowStock] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refetch whenever page or the low-stock filter changes. Cancellation-guarded
  // so a slow stale response can't clobber a newer query (mirrors OrdersPage).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listStock({ page, pageSize: PAGE_SIZE, lowStock });
        if (cancelled) return;
        setRows(res.data);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load inventory. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [page, lowStock]);

  function onToggleLowStock(next: boolean) {
    setPage(1); // a new filter resets to the first page
    setLowStock(next);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl font-semibold text-neutral-900">
          Inventory
        </h2>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={lowStock}
            onChange={(e) => onToggleLowStock(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-primary-500 focus:ring-primary-700"
          />
          Low stock only
        </label>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500"
        >
          {error}
        </div>
      )}

      {loading ? (
        <p role="status" aria-live="polite" className="text-neutral-600">
          Loading…
        </p>
      ) : error ? null : rows.length === 0 ? (
        <p role="status" aria-live="polite" className="text-neutral-600">
          {lowStock ? 'No low-stock items.' : 'No inventory found.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 text-neutral-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Product
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  SKU
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Available
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Reserved
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Threshold
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Stock
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.productId}
                  className="border-t border-neutral-200 text-neutral-900 transition-colors hover:bg-neutral-50"
                >
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2 text-neutral-600">{r.sku}</td>
                  <td className="px-4 py-2 text-right">{r.available}</td>
                  <td className="px-4 py-2 text-right text-neutral-600">
                    {r.reserved}
                  </td>
                  <td className="px-4 py-2 text-right text-neutral-600">
                    {r.lowStockThreshold}
                  </td>
                  <td className="px-4 py-2">
                    <LowStockBadge low={r.isLowStock} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </section>
  );
}
