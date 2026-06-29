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
import { useConfirm } from '../components/ui/confirm';
import { PageHeader, primaryBtn, secondaryBtn } from '../components/ui/PageHeader';

// Shared menu-item styling so every row action reads consistently.
const menuItemClass =
  'px-3 py-2 text-left text-sm text-content transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50';
const menuItemDangerClass =
  'px-3 py-2 text-left text-sm text-error-600 transition-colors hover:bg-error-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50';

const PAGE_SIZE = 20;
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function SellerProductsPage() {
  const confirm = useConfirm();
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

  async function onArchive(product: Product) {
    const ok = await confirm({
      title: 'Archive product',
      description: `Archive “${product.name}”? It will no longer be visible in the storefront.`,
      confirmLabel: 'Archive',
      destructive: true,
    });
    if (!ok) return;
    void runAction(product.id, () => archiveSellerProduct(product.id));
  }

  function onToggleActive(product: Product) {
    const activate = product.status !== 'ACTIVE';
    void runAction(product.id, () => setSellerProductActive(product.id, activate));
  }

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Catalog"
        title="My products"
        actions={
          <>
            <Link to="/seller/products/import" className={secondaryBtn}>
              Import CSV
            </Link>
            <Link to="/seller/products/new" className={primaryBtn}>
              Add product
            </Link>
          </>
        }
      />

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
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-content-subtle">
              <tr>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Name
                </th>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  SKU
                </th>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Price
                </th>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Status
                </th>
                <th scope="col" className="px-5 py-3 text-right text-[0.7rem] font-medium uppercase tracking-[0.1em]">
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
                    className="border-t border-line text-content transition-colors hover:bg-surface-muted/50"
                  >
                    <td className="px-5 py-3.5 font-medium">{product.name}</td>
                    <td className="px-5 py-3.5 text-content-muted">{product.sku}</td>
                    <td className="px-5 py-3.5 tabular-nums">
                      {usd.format(Number(product.price))}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="px-5 py-3.5">
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
