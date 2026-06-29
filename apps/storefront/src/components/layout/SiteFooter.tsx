import Link from 'next/link';

const linkClass =
  'text-sm text-content-muted transition-colors duration-300 hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';

const colHeadingClass =
  'text-xs font-medium uppercase tracking-[0.18em] text-content-subtle';

/** Footer link columns. Shop links are real routes; the rest are static. */
const FOOTER_COLUMNS = [
  {
    heading: 'Shop',
    links: [
      { href: '/products', label: 'All products' },
      { href: '/categories', label: 'Categories' },
      { href: '/products?sortBy=createdAt&sortDir=desc', label: 'New arrivals' },
      { href: '/sell', label: 'Sell with us' },
    ],
  },
  {
    heading: 'Help',
    links: [
      { href: '/orders', label: 'Track an order' },
      { href: '/account', label: 'My account' },
      { href: '/cart', label: 'Your cart' },
    ],
  },
] as const;

/** Static site footer rendered on every page. Editorial, multi-column. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <span className="font-heading text-2xl font-medium tracking-tight text-content">
            Coral&nbsp;Market
          </span>
          <p className="max-w-xs text-sm leading-relaxed text-content-muted">
            Everyday essentials and seasonal finds, curated and delivered with
            care.
          </p>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={col.heading} className="flex flex-col gap-3">
            <span className={colHeadingClass}>{col.heading}</span>
            {col.links.map((link) => (
              <Link key={link.label} href={link.href} className={linkClass}>
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-content-subtle sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Coral Market. All rights reserved.</span>
          <span className="uppercase tracking-[0.18em]">
            Essentials, considered.
          </span>
        </div>
      </div>
    </footer>
  );
}
