import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listSellerStock, type SellerStockRow } from '../lib/sellerInventory';
import { LowStockBadge } from '../components/inventory/LowStockBadge';
import { Pagination } from '../components/ui/Pagination';

const PAGE_SIZE = 20;

export function SellerInventoryPage() {
  const [rows, setRows] = useState<SellerStockRow[]>([]);
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
        const res = await listSellerStock({ page, pageSize: PAGE_SIZE, lowStock });
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
    <section className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-3xl font-medium tracking-tight text-content">
          My inventory
        </h2>
        <label className="flex items-center gap-2 text-sm text-content-muted">
          <input
            type="checkbox"
            checked={lowStock}
            onChange={(e) => onToggleLowStock(e.target.checked)}
            className="h-4 w-4 rounded border-line text-primary-500 focus:ring-primary-700"
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
        <p role="status" aria-live="polite" className="text-content-muted">
          Loading…
        </p>
      ) : error ? null : rows.length === 0 ? (
        <p role="status" aria-live="polite" className="text-content-muted">
          {lowStock ? 'No low-stock items.' : 'No inventory found.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-content-subtle">
              <tr>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Product
                </th>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  SKU
                </th>
                <th scope="col" className="px-5 py-3 text-right text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Available
                </th>
                <th scope="col" className="px-5 py-3 text-right text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Reserved
                </th>
                <th scope="col" className="px-5 py-3 text-right text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Threshold
                </th>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Stock
                </th>
                <th scope="col" className="px-5 py-3 text-right text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.productId}
                  className="border-t border-line text-content transition-colors hover:bg-surface-sunk"
                >
                  <td className="px-5 py-3.5 font-medium">{r.name}</td>
                  <td className="px-5 py-3.5 text-content-muted">{r.sku}</td>
                  <td className="px-5 py-3.5 text-right">{r.available}</td>
                  <td className="px-5 py-3.5 text-right text-content-muted">
                    {r.reserved}
                  </td>
                  <td className="px-5 py-3.5 text-right text-content-muted">
                    {r.lowStockThreshold}
                  </td>
                  <td className="px-5 py-3.5">
                    <LowStockBadge low={r.isLowStock} />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end">
                      <Link
                        to={`/seller/inventory/${r.productId}`}
                        className="border border-line px-4 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.1em] text-content transition-colors duration-200 hover:border-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
                      >
                        Manage
                      </Link>
                    </div>
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
