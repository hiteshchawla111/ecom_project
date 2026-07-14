import { NavLink, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { LogoutButton } from './LogoutButton';
import { NotificationBell } from './notifications/NotificationBell';
import { ThemeToggle } from './ui/ThemeToggle';

const groupLabelClass =
  'px-3 pb-2 pt-6 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white/30';

const ic = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const ICONS: Record<string, ReactNode> = {
  dashboard: <svg {...ic}><path d="M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z" /></svg>,
  products: <svg {...ic}><path d="M20 7 12 3 4 7v10l8 4 8-4zM4 7l8 4 8-4M12 11v10" /></svg>,
  categories: <svg {...ic}><path d="M3 7h7v4H3zM14 7h7v10h-7zM3 15h7v2H3z" /></svg>,
  orders: <svg {...ic}><path d="M6 2h12l1 7H5zM5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /></svg>,
  sellers: <svg {...ic}><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  inventory: <svg {...ic}><path d="M3 3h18v6H3zM3 9v12h18V9M9 13h6" /></svg>,
  report: <svg {...ic}><path d="M3 3v18h18M8 17V9M13 17V5M18 17v-6" /></svg>,
  settings: <svg {...ic}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17 2 2 0 0 1-4 0 1.65 1.65 0 0 0-2.82-1.17l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.5 1z" /></svg>,
};

function NavItem({
  to,
  end,
  icon,
  children,
}: {
  to: string;
  end?: boolean;
  icon: keyof typeof ICONS;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 py-2 text-sm transition-colors duration-200 ${
          isActive
            ? 'bg-white/[0.08] font-medium text-white'
            : 'text-white/55 hover:bg-white/[0.04] hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1/2 h-full -translate-y-1/2 bg-primary-500 transition-opacity duration-200 ${
              isActive ? 'w-0.5 opacity-100' : 'w-0.5 opacity-0'
            }`}
          />
          <span className={isActive ? 'text-primary-300' : 'text-white/40 group-hover:text-white/70'}>
            {ICONS[icon]}
          </span>
          {children}
        </>
      )}
    </NavLink>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const isAdmin = user!.role === 'ADMIN';
  const isSeller = user!.role === 'SELLER';

  return (
    <div className="flex min-h-screen">
      <aside className="relative flex w-64 shrink-0 flex-col bg-gradient-to-b from-neutral-900 to-[#171310] px-4 py-5 text-white">
        {/* Soft brand glow at the top for depth. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-primary-500/10 blur-3xl"
        />
        {/* Hairline right edge. */}
        <div aria-hidden="true" className="absolute inset-y-0 right-0 w-px bg-white/10" />

        <div className="relative flex flex-col gap-1 border-b border-white/10 px-2 pb-5">
          <span className="font-serif text-[1.35rem] font-medium leading-none tracking-tight text-white">
            Coral&nbsp;Market
          </span>
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-white/40">
            {isSeller ? 'Seller portal' : 'Admin console'}
          </span>
        </div>

        <nav aria-label="Sidebar" className="relative mt-4 flex flex-col gap-0.5 text-sm">
          <NavItem to="/" end icon="dashboard">
            Dashboard
          </NavItem>

          {isSeller ? (
            <>
              <p className={groupLabelClass}>Fulfillment</p>
              <NavItem to="/seller/orders" icon="orders">
                Orders
              </NavItem>

              <p className={groupLabelClass}>Catalog</p>
              <NavItem to="/seller/products" icon="products">
                My Products
              </NavItem>
              <NavItem to="/seller/inventory" end icon="inventory">
                My Inventory
              </NavItem>
              <NavItem to="/seller/inventory/reports" icon="report">
                Inventory report
              </NavItem>
            </>
          ) : (
            <>
              {isAdmin && (
                <>
                  <p className={groupLabelClass}>Catalog</p>
                  <NavItem to="/products" icon="products">
                    Products
                  </NavItem>
                  <NavItem to="/categories" icon="categories">
                    Categories
                  </NavItem>
                </>
              )}

              {/* Operations — Orders and Sellers are ADMIN-only; Inventory is open
                  to both internal roles (ADMIN + INVENTORY_MANAGER). */}
              <p className={groupLabelClass}>Operations</p>
              {isAdmin && (
                <>
                  <NavItem to="/orders" icon="orders">
                    Orders
                  </NavItem>
                  <NavItem to="/sellers" icon="sellers">
                    Sellers
                  </NavItem>
                  <NavItem to="/reviews" icon="report">
                    Reviews
                  </NavItem>
                </>
              )}
              <NavItem to="/inventory" end icon="inventory">
                Inventory
              </NavItem>
              <NavItem to="/inventory/reports" icon="report">
                Inventory report
              </NavItem>
            </>
          )}
          {isAdmin && (
            <>
              <p className={groupLabelClass}>System</p>
              <NavItem to="/settings" icon="settings">
                Settings
              </NavItem>
            </>
          )}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/80 px-8 py-4 backdrop-blur">
          <span className="flex items-center gap-2.5 text-sm text-content-muted">
            <span
              aria-hidden="true"
              className="inline-flex size-8 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold uppercase text-white"
            >
              {user!.email.charAt(0)}
            </span>
            <span className="sr-only">Signed in as </span>
            <span data-testid="current-user">{user!.email}</span>
          </span>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-surface-sunk px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
