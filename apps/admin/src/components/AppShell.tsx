import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LogoutButton } from './LogoutButton';

// Active state is conveyed by a left accent border + tint + weight (not color
// alone); the transparent border on inactive links keeps the width stable.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center rounded-md border-l-2 px-3 py-2 transition-colors ${
    isActive
      ? 'border-primary-500 bg-primary-500/10 font-medium text-primary-700'
      : 'border-transparent text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
  }`;

const groupLabelClass =
  'px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400';

export function AppShell() {
  const { user } = useAuth();
  const isAdmin = user!.role === 'ADMIN';

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-neutral-0 p-4">
        <div className="flex items-center gap-2 px-1">
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary-500 font-heading text-sm font-bold text-white"
          >
            A
          </span>
          <h1 className="font-heading text-lg font-semibold text-neutral-900">
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
              <p className={groupLabelClass}>Operations</p>
              <NavLink to="/orders" className={navLinkClass}>
                Orders
              </NavLink>
            </>
          )}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-200 bg-neutral-0 px-6 py-3">
          <span className="text-sm text-neutral-600">
            <span className="sr-only">Signed in as </span>
            <span data-testid="current-user">{user!.email}</span>
          </span>
          <LogoutButton />
        </header>
        <main className="flex-1 overflow-y-auto bg-neutral-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
