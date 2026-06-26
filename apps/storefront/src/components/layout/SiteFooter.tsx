import Link from 'next/link';

const linkClass =
  'text-sm text-content-muted transition-colors hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';

/** Static site footer rendered on every page. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <span className="font-heading text-lg font-bold text-primary-500">
            Coral&nbsp;Market
          </span>
          <p className="max-w-xs text-sm text-content-muted">
            Everyday essentials and seasonal finds, delivered with care.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-content-subtle">
            Shop
          </span>
          <Link href="/products" className={linkClass}>
            Products
          </Link>
          <Link href="/categories" className={linkClass}>
            Categories
          </Link>
          <Link href="/sell" className={linkClass}>
            Sell with us
          </Link>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 text-xs text-content-subtle">
          © {new Date().getFullYear()} Coral Market. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
