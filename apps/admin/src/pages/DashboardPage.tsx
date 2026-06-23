import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listProducts } from '../lib/products';
import { StatCard } from '../components/ui/StatCard';

/** Small inline icons for the metric cards (aria-hidden via StatCard). */
const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const ProductsIcon = () => (
  <svg {...iconProps}>
    <path d="M20 7L12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10" />
  </svg>
);
const RevenueIcon = () => (
  <svg {...iconProps}>
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
);
const OrdersIcon = () => (
  <svg {...iconProps}>
    <path d="M6 2h12l1 7H5l1-7zM5 9v11a1 1 0 001 1h12a1 1 0 001-1V9" />
  </svg>
);
const LowStockIcon = () => (
  <svg {...iconProps}>
    <path d="M12 9v4M12 17h.01M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3.1l-8-14a2 2 0 00-3.4 0z" />
  </svg>
);

/**
 * Admin dashboard. Shows the one metric we can honestly source today — the
 * total product count — plus clearly-labelled placeholders for analytics that
 * land in a later phase. We deliberately do NOT fabricate numbers.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const [productCount, setProductCount] = useState<string>('—');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await listProducts({ page: 1, pageSize: 1 });
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
        <h2 className="font-heading text-2xl font-semibold text-neutral-900">
          Dashboard
        </h2>
        <p className="text-neutral-600">Welcome, {user?.email}.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total products"
          value={productCount}
          icon={<ProductsIcon />}
        />
        <StatCard
          label="Revenue"
          value="—"
          hint="Coming soon"
          icon={<RevenueIcon />}
        />
        <StatCard
          label="Orders"
          value="—"
          hint="Coming soon"
          icon={<OrdersIcon />}
        />
        <StatCard
          label="Low stock"
          value="—"
          hint="Coming soon"
          icon={<LowStockIcon />}
        />
      </div>
    </section>
  );
}
