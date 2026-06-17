import { useCallback, useEffect, useState } from 'react';
import {
  archiveProduct,
  listProducts,
  setProductActive,
  type Product,
} from '../lib/products';
import { StatusBadge } from '../components/products/StatusBadge';

const PAGE_SIZE = 20;
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reloads keep the table visible (per-row `busyId` shows action progress);
  // the full-page loader is only for the initial mount (loading starts true).
  const load = useCallback(async () => {
    try {
      const res = await listProducts({ page: 1, pageSize: PAGE_SIZE });
      setProducts(res.data);
    } catch {
      setError('Could not load products. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Mount fetch. State updates run after the await and are cancellation-guarded,
  // mirroring AuthContext's boot effect (no synchronous setState in the effect).
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const res = await listProducts({ page: 1, pageSize: PAGE_SIZE });
        if (!cancelled) setProducts(res.data);
      } catch {
        if (!cancelled) setError('Could not load products. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAction(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch {
      setError('The action could not be completed. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  function onArchive(product: Product) {
    const ok = window.confirm(
      `Archive “${product.name}”? It will no longer be visible in the storefront.`,
    );
    if (!ok) return;
    void runAction(product.id, () => archiveProduct(product.id));
  }

  function onToggleActive(product: Product) {
    const activate = product.status !== 'ACTIVE';
    void runAction(product.id, () => setProductActive(product.id, activate));
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h2 className="font-heading text-2xl font-semibold text-neutral-900">
          Products
        </h2>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p role="status" aria-live="polite" className="text-neutral-600">
          Loading…
        </p>
      ) : products.length === 0 ? (
        <p className="text-neutral-600">No products yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 text-neutral-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  SKU
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Price
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
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
                    className="border-t border-neutral-200 text-neutral-900"
                  >
                    <td className="px-4 py-3">{product.name}</td>
                    <td className="px-4 py-3 text-neutral-600">{product.sku}</td>
                    <td className="px-4 py-3">
                      {usd.format(Number(product.price))}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {!isArchived && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onToggleActive(product)}
                            className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-900 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
                          >
                            {product.status === 'ACTIVE'
                              ? 'Deactivate'
                              : 'Activate'}
                          </button>
                        )}
                        {!isArchived && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onArchive(product)}
                            className="rounded-md border border-error-500 px-3 py-1.5 text-xs font-medium text-error-500 transition-colors hover:bg-error-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50"
                          >
                            Archive
                          </button>
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
    </section>
  );
}
