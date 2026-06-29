import Link from 'next/link';
import type { Product } from '@/lib/catalog';
import { ProductCard } from '@/components/catalog/ProductCard';
import { Reveal } from '@/components/motion/Reveal';

export interface ProductRowProps {
  /** Small eyebrow label above the title (e.g. "Limited time"). */
  eyebrow?: string;
  title: string;
  /** Optional "see all" link target. */
  href?: string;
  /** Link label (defaults to "See all"). */
  linkLabel?: string;
  products: Product[];
}

/**
 * A titled, single-row product section: editorial header + a responsive,
 * scroll-revealed product grid. Reuses {@link ProductCard} so styling stays
 * consistent with the rest of the catalog. Renders nothing when empty.
 *
 * Presentational only — it receives already-fetched products as a prop.
 */
export function ProductRow({
  eyebrow,
  title,
  href,
  linkLabel = 'See all',
  products,
}: ProductRowProps) {
  if (products.length === 0) return null;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4 border-b border-line pb-5">
        <div className="flex flex-col gap-1.5">
          {eyebrow && (
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
              {eyebrow}
            </span>
          )}
          <h2 className="font-heading text-3xl font-extrabold tracking-tight text-content sm:text-4xl">
            {title}
          </h2>
        </div>
        {href && (
          <Link
            href={href}
            className="group hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-content transition-colors hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 sm:inline-flex"
          >
            {linkLabel}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>
      <Reveal
        stagger
        className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4"
      >
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </Reveal>
    </section>
  );
}
