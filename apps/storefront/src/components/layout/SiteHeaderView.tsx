import Link from 'next/link';
import type { CurrentUser } from '@/lib/api-auth';
import { MobileNav } from './MobileNav';
import { NavLinks } from './NavLinks';
import { HeaderMotion } from './HeaderMotion';
import { ThemeToggle } from './ThemeToggle';
import { CartCountBadge } from '@/components/cart/CartCountBadge';
import { SearchAutocomplete } from '@/components/search/SearchAutocomplete';

/** Primary navigation links, shared by the desktop bar and the mobile menu. */
export const NAV_LINKS = [
  { href: '/products', label: 'Products' },
  { href: '/categories', label: 'Categories' },
  { href: '/sell', label: 'Sell with us' },
] as const;

const actionLinkClass =
  'text-xs font-medium uppercase tracking-[0.14em] text-content transition-colors duration-300 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';

export interface SiteHeaderViewProps {
  user: CurrentUser | null;
}

/**
 * Presentational site header. Pure over `user` (no `server-only` imports) so it
 * is unit-testable; the server wrapper {@link import('./SiteHeader')} resolves
 * the session and passes it in.
 *
 * Layout is a 3-equal-column grid (`brand+nav | search | actions`) so the search
 * sits in the true optical centre regardless of how wide the left group grows —
 * the previous flex layout let the brand+nav push search into the right third.
 *
 * Motion (entrance, scroll-condense, hover) lives in client wrappers
 * ({@link HeaderMotion}, {@link NavLinks}); this component stays markup-only.
 */
export function SiteHeaderView({ user }: SiteHeaderViewProps) {
  return (
    <header
      data-condensed="false"
      className="fixed inset-x-0 top-0 z-50 h-[var(--header-h)] border-b border-line bg-surface/80 backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-300 data-[condensed=true]:border-line data-[condensed=true]:bg-surface/95 data-[condensed=true]:shadow-[0_1px_0_0_var(--color-line),0_8px_24px_-16px_rgba(0,0,0,0.45)]"
    >
      <HeaderMotion>
        <div className="mx-auto grid h-full w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-6">
          {/* Left zone: wordmark + primary nav */}
          <div data-header-reveal className="flex min-w-0 items-center gap-8">
            <Link
              href="/"
              aria-label="Home"
              className="font-heading text-2xl font-medium tracking-tight text-content transition-colors duration-300 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            >
              Coral&nbsp;Market
            </Link>
            <NavLinks links={NAV_LINKS} />
          </div>

          {/* Centre zone: search (optically centred via the equal side columns) */}
          <div
            data-header-reveal
            className="hidden w-full min-w-0 max-w-md justify-self-center md:block"
          >
            <SearchAutocomplete />
          </div>

          {/* Right zone: theme, cart, auth — right-aligned within its column */}
          <div data-header-reveal className="flex items-center justify-end gap-2">
            <ThemeToggle />
            <Link
              href="/cart"
              data-cart-link
              className="relative rounded-md p-2 text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            >
              <CartIcon />
              <CartCountBadge />
              <span className="sr-only">Cart</span>
            </Link>

            {user ? (
              <Link
                href="/account"
                className={`hidden sm:inline-block ${actionLinkClass}`}
              >
                My account
              </Link>
            ) : (
              <div className="hidden items-center gap-5 sm:flex">
                <Link href="/login" className={actionLinkClass}>
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="bg-primary-600 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-white transition-colors duration-300 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  Sign up
                </Link>
              </div>
            )}

            <MobileNav links={NAV_LINKS} isAuthenticated={Boolean(user)} />
          </div>
        </div>
      </HeaderMotion>
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
