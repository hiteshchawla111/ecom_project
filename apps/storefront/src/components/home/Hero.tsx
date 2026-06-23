import Link from 'next/link';

export interface HeroProps {
  primaryCtaHref?: string;
  secondaryCtaHref?: string;
}

/**
 * Home-page hero banner. Static marketing copy with two CTAs. Presentational
 * and prop-driven so it's unit-testable.
 */
export function Hero({
  primaryCtaHref = '/products',
  secondaryCtaHref = '/categories',
}: HeroProps) {
  return (
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-primary-50 via-surface to-secondary-50 ring-1 ring-line">
      <div className="flex flex-col gap-6 px-6 py-14 sm:px-12 sm:py-20">
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary-700">
          Now shipping
        </span>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight text-content sm:text-5xl">
          Everyday essentials,{' '}
          <span className="text-primary-500">seasonal finds.</span>
        </h1>
        <p className="max-w-xl text-base text-content-muted sm:text-lg">
          Discover a curated catalog delivered with care. Browse the latest
          arrivals or shop by category.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={primaryCtaHref}
            className="rounded-md bg-primary-500 px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            Shop products
          </Link>
          <Link
            href={secondaryCtaHref}
            className="rounded-md border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-content transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            Browse categories
          </Link>
        </div>
      </div>
    </section>
  );
}
