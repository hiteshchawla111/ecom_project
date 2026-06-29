import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LogoutButton } from './LogoutButton';
import { ThemeToggle } from './ui/ThemeToggle';

// Active state is conveyed by a left accent border + tint + weight (not color
// alone); the transparent border on inactive links keeps the width stable.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center border-l-2 px-3 py-2 text-sm transition-colors duration-200 ${
    isActive
      ? 'border-content bg-surface-muted font-medium text-content'
      : 'border-transparent text-content-muted hover:bg-surface-muted hover:text-content'
  }`;

const groupLabelClass =
  'px-3 pb-1.5 pt-5 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-content-subtle';

export function AppShell() {
  const { user } = useAuth();
  const isAdmin = user!.role === 'ADMIN';
  const isSeller = user!.role === 'SELLER';

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface p-4">
        <div className="flex flex-col gap-0.5 px-2 pt-1">
          <span className="font-heading text-lg font-bold tracking-tight text-content">
            Coral&nbsp;Market
          </span>
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-content-subtle">
            {isSeller ? 'Seller portal' : 'Admin'}
          </span>
        </div>

        <nav aria-label="Sidebar" className="mt-6 flex flex-col gap-0.5 text-sm">
          <NavLink to="/" end className={navLinkClass}>
            Dashboard
          </NavLink>

          {isSeller ? (
            <>
              <p className={groupLabelClass}>Catalog</p>
              <NavLink to="/seller/products" className={navLinkClass}>
                My Products
              </NavLink>
              <NavLink to="/seller/inventory" end className={navLinkClass}>
                My Inventory
              </NavLink>
              <NavLink to="/seller/inventory/reports" className={navLinkClass}>
                Inventory report
              </NavLink>
            </>
          ) : (
            <>
              {isAdmin && (
                <>
                  <p className={groupLabelClass}>Catalog</p>
                  <NavLink to="/products" className={navLinkClass}>
                    Products
                  </NavLink>
                  <NavLink to="/categories" className={navLinkClass}>
                    Categories
                  </NavLink>
                </>
              )}

              {/* Operations — Orders and Sellers are ADMIN-only; Inventory is open
                  to both internal roles (ADMIN + INVENTORY_MANAGER). */}
              <p className={groupLabelClass}>Operations</p>
              {isAdmin && (
                <>
                  <NavLink to="/orders" className={navLinkClass}>
                    Orders
                  </NavLink>
                  <NavLink to="/sellers" className={navLinkClass}>
                    Sellers
                  </NavLink>
                </>
              )}
              <NavLink to="/inventory" end className={navLinkClass}>
                Inventory
              </NavLink>
              <NavLink to="/inventory/reports" className={navLinkClass}>
                Inventory report
              </NavLink>
            </>
          )}
          {isAdmin && (
            <>
              <p className={groupLabelClass}>System</p>
              <NavLink to="/settings" className={navLinkClass}>
                Settings
              </NavLink>
            </>
          )}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/90 px-6 py-3 backdrop-blur">
          <span className="flex items-center gap-2 text-sm text-content-muted">
            <span
              aria-hidden="true"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold uppercase text-primary-700"
            >
              {user!.email.charAt(0)}
            </span>
            <span className="sr-only">Signed in as </span>
            <span data-testid="current-user">{user!.email}</span>
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-surface-sunk p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
