import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LogoutButton } from './LogoutButton';
import { ThemeToggle } from './ui/ThemeToggle';

// Active state is conveyed by a left accent border + tint + weight (not color
// alone); the transparent border on inactive links keeps the width stable.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center rounded-md border-l-2 px-3 py-2 transition-colors ${
    isActive
      ? 'border-primary-500 bg-primary-500/10 font-medium text-primary-700'
      : 'border-transparent text-content-muted hover:bg-surface-muted hover:text-content'
  }`;

const groupLabelClass =
  'px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-content-subtle';

export function AppShell() {
  const { user } = useAuth();
  const isAdmin = user!.role === 'ADMIN';

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface p-4">
        <div className="flex items-center gap-2.5 px-1">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 font-heading text-base font-bold text-white shadow-sm"
          >
            A
          </span>
          <h1 className="font-heading text-lg font-semibold tracking-tight text-content">
            Admin
          </h1>
        </div>

        <nav aria-label="Sidebar" className="mt-6 flex flex-col gap-1 text-sm">
          <NavLink to="/" end className={navLinkClass}>
            Dashboard
          </NavLink>
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
          <NavLink to="/inventory" className={navLinkClass}>
            Inventory
          </NavLink>

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
