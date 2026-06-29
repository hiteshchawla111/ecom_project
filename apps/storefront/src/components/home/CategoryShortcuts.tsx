import Link from 'next/link';
import type { Category } from '@/lib/catalog';

export interface CategoryShortcutsProps {
  categories: Category[];
}

/** Deterministic, stable cover image per category (seeded by slug). */
function categoryCover(slug: string): string {
  return `https://picsum.photos/seed/cat-${encodeURIComponent(slug)}/500/400`;
}

/**
 * Image-backed category cards for the home page. Each tile pairs a category
 * cover with a dark scrim so the label stays legible, and lifts on hover.
 * Renders nothing when there are no categories (graceful empty state).
 */
export function CategoryShortcuts({ categories }: CategoryShortcutsProps) {
  if (categories.length === 0) return null;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4 border-b border-line pb-5">
        <h2 className="font-heading text-4xl font-medium tracking-[-0.01em] text-content sm:text-5xl">
          Shop by category
        </h2>
        <Link
          href="/categories"
          className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-content transition-colors hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          View all
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
      </div>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={`/categories/${category.slug}`}
              className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-lg border border-line shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={categoryCover(category.slug)}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-neutral-900/85 via-neutral-900/25 to-transparent transition-opacity duration-300 group-hover:from-neutral-900/90"
              />
              <span className="relative p-3 text-sm font-bold leading-tight text-white">
                {category.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
