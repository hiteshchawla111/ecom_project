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
  'text-xs font-medium uppercase tracking-[0.14em] text-content-muted transition-colors duration-300 hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';

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
        <div className="flex items-center gap-8">
          <Link
            href="/"
            aria-label="Home"
            className="font-heading text-2xl font-medium tracking-tight text-content transition-colors duration-300 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            Coral&nbsp;Market
          </Link>
          <nav
            aria-label="Primary"
            className="hidden items-center gap-7 md:flex"
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
              className="hidden text-xs font-medium uppercase tracking-[0.14em] text-content transition-colors duration-300 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 sm:inline-block"
            >
              My account
            </Link>
          ) : (
            <div className="hidden items-center gap-5 sm:flex">
              <Link
                href="/login"
                className="text-xs font-medium uppercase tracking-[0.14em] text-content transition-colors duration-300 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="bg-content px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-surface transition-colors duration-300 hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
