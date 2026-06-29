import Link from 'next/link';
import type { CurrentUser } from '@/lib/api-auth';
import { MobileNav } from './MobileNav';
import { ThemeToggle } from './ThemeToggle';
import { CartCountBadge } from '@/components/cart/CartCountBadge';
import { SearchAutocomplete } from '@/components/search/SearchAutocomplete';

/** Primary navigation links, shared by the desktop bar and the mobile menu. */
export const NAV_LINKS = [
  { href: '/products', label: 'Products' },
  { href: '/categories', label: 'Categories' },
  { href: '/sell', label: 'Sell with us' },
] as const;

const linkClass =
  'rounded-md px-2 py-1 text-sm font-medium text-content-muted transition-colors hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';

export interface SiteHeaderViewProps {
  user: CurrentUser | null;
}

/**
 * Presentational site header. Pure over `user` (no `server-only` imports) so it
 * is unit-testable; the server wrapper {@link import('./SiteHeader')} resolves
 * the session and passes it in.
 */
export function SiteHeaderView({ user }: SiteHeaderViewProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[var(--header-h)] border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            aria-label="Home"
            className="font-heading text-xl font-bold tracking-tight text-primary-500 transition-colors hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            Coral&nbsp;Market
          </Link>
          <nav
            aria-label="Primary"
            className="hidden items-center gap-1 md:flex"
          >
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden flex-1 justify-center px-4 md:flex">
          <SearchAutocomplete />
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/cart"
            className="relative rounded-md p-2 text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            <CartIcon />
            <CartCountBadge />
            <span className="sr-only">Cart</span>
          </Link>

          {user ? (
            <Link
              href="/account"
              className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-content transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 sm:inline-block"
            >
              My account
            </Link>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-content transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-surface transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
              >
                Sign up
              </Link>
            </div>
          )}

          <MobileNav links={NAV_LINKS} isAuthenticated={Boolean(user)} />
        </div>
      </div>
    </header>
  );
}

function CartIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}
