import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  archiveSellerProduct,
  listSellerProducts,
  setSellerProductActive,
} from '../lib/sellerProducts';
import type { Product } from '../lib/products';
import { StatusBadge } from '../components/products/StatusBadge';
import { Pagination } from '../components/ui/Pagination';
import { RowActionsMenu } from '../components/ui/RowActionsMenu';

// Shared menu-item styling so every row action reads consistently.
const menuItemClass =
  'rounded px-3 py-1.5 text-left text-sm text-content transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50';
const menuItemDangerClass =
  'rounded px-3 py-1.5 text-left text-sm text-error-500 transition-colors hover:bg-error-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50';

const PAGE_SIZE = 20;
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function SellerProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Bumped to force a refetch of the current page after a row action.
  const [refreshTick, setRefreshTick] = useState(0);

  // Single source of fetching: refetch whenever the page (or refresh tick)
  // changes. State updates are cancellation-guarded — each effect run owns its
  // own `cancelled` flag, so a slow stale response can't clobber a newer page
  // (mirrors AuthContext's boot effect; no synchronous setState in the effect).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await listSellerProducts({ page, pageSize: PAGE_SIZE });
        if (cancelled) return;
        // If a non-first page came back empty (e.g. the last item was removed),
        // step back one page; the dep change triggers a fresh fetch.
        if (res.data.length === 0 && page > 1) {
          setPage(page - 1);
          return;
        }
        setProducts(res.data);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load products. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [page, refreshTick]);

  // Refetch the current page (used after a row action mutates a product).
  const reload = useCallback(() => setRefreshTick((t) => t + 1), []);

  async function runAction(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      reload();
    } catch {
      setError('The action could not be completed. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  function onArchive(product: Product) {
    const ok = window.confirm(
      `Archive "${product.name}"? It will no longer be visible in the storefront.`,
    );
    if (!ok) return;
    void runAction(product.id, () => archiveSellerProduct(product.id));
  }

  function onToggleActive(product: Product) {
    const activate = product.status !== 'ACTIVE';
    void runAction(product.id, () => setSellerProductActive(product.id, activate));
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h2 className="font-heading text-2xl font-semibold text-content">
          My products
        </h2>
        <div className="flex items-center gap-2">
          <Link
            to="/seller/products/import"
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            Import CSV
          </Link>
          <Link
            to="/seller/products/new"
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            Add product
          </Link>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={reload}
            className="rounded-md border border-error-500 px-3 py-1.5 text-xs font-medium text-error-500 transition-colors hover:bg-error-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p role="status" aria-live="polite" className="text-content-muted">
          Loading…
        </p>
      ) : error ? null : products.length === 0 ? (
        <p className="text-content-muted">No products yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-content-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Name
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  SKU
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Price
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const isArchived = product.status === 'ARCHIVED';
                const isBusy = busyId === product.id;
                return (
                  <tr
                    key={product.id}
                    className="border-t border-line text-content transition-colors hover:bg-surface-sunk"
                  >
                    <td className="px-4 py-2 font-medium">{product.name}</td>
                    <td className="px-4 py-2 text-content-muted">{product.sku}</td>
                    <td className="px-4 py-2">
                      {usd.format(Number(product.price))}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end">
                        {isArchived ? (
                          <span className="text-xs text-content-subtle">
                            No actions
                          </span>
                        ) : (
                          <RowActionsMenu
                            label={`Actions for ${product.name}`}
                          >
                            <Link
                              to={`/seller/products/${product.id}/edit`}
                              className={menuItemClass}
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => onToggleActive(product)}
                              className={menuItemClass}
                            >
                              {product.status === 'ACTIVE'
                                ? 'Deactivate'
                                : 'Activate'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => onArchive(product)}
                              className={menuItemDangerClass}
                            >
                              Archive
                            </button>
                          </RowActionsMenu>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && products.length > 0 && (
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
