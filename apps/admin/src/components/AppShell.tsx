import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LogoutButton } from './LogoutButton';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 font-medium transition-colors ${
    isActive
      ? 'bg-neutral-100 text-neutral-900'
      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
  }`;

export function AppShell() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-neutral-200 bg-neutral-0 p-4">
        <h1 className="font-heading text-lg font-semibold text-neutral-900">Admin</h1>
        <nav aria-label="Sidebar" className="mt-6 flex flex-col gap-1 text-sm">
          <NavLink to="/" end className={navLinkClass}>
            Dashboard
          </NavLink>
          {user!.role === 'ADMIN' && (
            <>
              <NavLink to="/products" className={navLinkClass}>
                Products
              </NavLink>
              <NavLink to="/categories" className={navLinkClass}>
                Categories
              </NavLink>
            </>
          )}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
          <span className="text-sm text-neutral-600">
            <span className="sr-only">Signed in as </span>
            <span data-testid="current-user">{user!.email}</span>
          </span>
          <LogoutButton />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
