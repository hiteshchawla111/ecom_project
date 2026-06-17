import Link from 'next/link';

const linkClass =
  'text-sm text-neutral-600 transition-colors hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';

/** Static site footer rendered on every page. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-neutral-200 bg-neutral-0">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <span className="font-heading text-lg font-bold text-primary-500">
            Coral&nbsp;Market
          </span>
          <p className="max-w-xs text-sm text-neutral-600">
            Everyday essentials and seasonal finds, delivered with care.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Shop
          </span>
          <Link href="/products" className={linkClass}>
            Products
          </Link>
          <Link href="/categories" className={linkClass}>
            Categories
          </Link>
        </nav>
      </div>
      <div className="border-t border-neutral-200">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 text-xs text-neutral-400">
          © {new Date().getFullYear()} Coral Market. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
