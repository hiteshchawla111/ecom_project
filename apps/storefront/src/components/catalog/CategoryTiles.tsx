import Link from 'next/link';
import type { Category } from '@/lib/catalog';

interface CategoryTilesProps {
  categories: Category[];
}

/**
 * Deterministic gradient per category so a given category always looks the same
 * across renders/pages. Pulls from the design-token palette (coral / teal /
 * amber families) — never hardcoded hex outside the token classes. Seeded by a
 * simple name hash so the assignment is stable without needing a schema field.
 */
const GRADIENTS = [
  'from-primary-500 to-primary-700',
  'from-secondary-500 to-secondary-700',
  'from-primary-600 to-secondary-700',
  'from-accent-600 to-primary-700',
] as const;

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function gradientFor(name: string): string {
  return GRADIENTS[hashName(name) % GRADIENTS.length];
}

/**
 * Storefront categories landing. Renders top-level categories as a responsive
 * grid of branded gradient tiles — a browsable entry point rather than a nested
 * text list. Each tile links to its slug page, shows the real subcategory count
 * (no fabricated product totals, since the API doesn't expose them here), and
 * surfaces direct links to its children as chips. Depth beyond one level stays
 * reachable via each subcategory's own page.
 */
export function CategoryTiles({ categories }: CategoryTilesProps) {
  if (categories.length === 0) return null;

  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => {
        const children = category.children ?? [];
        const childCount = children.length;

        return (
          <li key={category.id}>
            <Link
              href={`/categories/${category.slug}`}
              className={`group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-lg bg-gradient-to-br ${gradientFor(
                category.name,
              )} p-5 text-neutral-0 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-700`}
            >
              {/* Decorative emblem — first letter, large and faint, top-right. */}
              <span
                aria-hidden="true"
                className="absolute right-4 top-3 font-heading text-6xl font-bold leading-none text-neutral-0/20 transition-transform duration-300 group-hover:scale-110"
              >
                {category.name.charAt(0).toUpperCase()}
              </span>

              <h2 className="font-heading text-xl font-bold leading-tight">
                {category.name}
              </h2>
              {childCount > 0 && (
                <p className="mt-1 text-sm text-neutral-0/80">
                  {childCount} {childCount === 1 ? 'subcategory' : 'subcategories'}
                </p>
              )}
            </Link>

            {childCount > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/categories/${child.slug}`}
                      className="inline-flex rounded-full border border-neutral-200 bg-neutral-0 px-3 py-1 text-sm text-neutral-700 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
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
