import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listSellerProducts } from '../lib/sellerProducts';
import { StatCard } from '../components/ui/StatCard';

/**
 * Seller dashboard. Shows the one metric we can honestly source today — the
 * seller's own product count — plus clearly-labelled placeholders for
 * analytics that land in a later phase. We deliberately do NOT fabricate numbers.
 */
export function SellerDashboardPage() {
  const { user } = useAuth();
  const [productCount, setProductCount] = useState<string>('—');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await listSellerProducts({ page: 1, pageSize: 1 });
        if (!cancelled) setProductCount(String(res.total));
      } catch {
        if (!cancelled) setProductCount('—');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-semibold text-content">
          Seller dashboard
        </h2>
        <p className="text-content-muted">Welcome, {user?.email}.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My products" value={productCount} />
        <StatCard label="Low stock" value="—" hint="Coming soon" />
        <StatCard label="Orders" value="—" hint="Coming soon" />
        <StatCard label="Revenue" value="—" hint="Coming soon" />
      </div>
    </section>
  );
}
