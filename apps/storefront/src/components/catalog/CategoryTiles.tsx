import Link from 'next/link';
import type { Category } from '@/lib/catalog';

interface CategoryTilesProps {
  categories: Category[];
}

/** Deterministic, stable cover image per category (seeded by slug). */
function categoryCover(slug: string): string {
  return `https://picsum.photos/seed/cat-${encodeURIComponent(slug)}/700/520`;
}

/**
 * Storefront categories landing. Renders top-level categories as a responsive
 * grid of image-backed editorial tiles — a browsable entry point rather than a
 * nested text list. Each tile links to its slug page, shows the real
 * subcategory count (no fabricated product totals, since the API doesn't expose
 * them here), and surfaces direct links to its children as chips. Depth beyond
 * one level stays reachable via each subcategory's own page.
 */
export function CategoryTiles({ categories }: CategoryTilesProps) {
  if (categories.length === 0) return null;

  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => {
        const children = category.children ?? [];
        const childCount = children.length;

        return (
          <li key={category.id} className="flex flex-col gap-3">
            <Link
              href={`/categories/${category.slug}`}
              className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-lg border border-line text-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-700"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={categoryCover(category.slug)}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-neutral-900/85 via-neutral-900/25 to-transparent"
              />
              <div className="relative flex flex-col gap-1 p-6">
                <h2 className="font-heading text-2xl font-medium leading-tight">
                  {category.name}
                </h2>
                {childCount > 0 && (
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/75">
                    {childCount}{' '}
                    {childCount === 1 ? 'subcategory' : 'subcategories'}
                  </p>
                )}
              </div>
            </Link>

            {childCount > 0 && (
              <ul className="flex flex-wrap gap-2">
                {children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/categories/${child.slug}`}
                      className="inline-flex border border-line bg-surface px-3 py-1.5 text-xs font-medium uppercase tracking-[0.1em] text-content-muted transition-colors duration-200 hover:border-content hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
                    >
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
