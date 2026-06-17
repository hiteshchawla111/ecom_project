import Link from 'next/link';
import type { Category } from '@/lib/catalog';

export interface CategoryShortcutsProps {
  categories: Category[];
}

/**
 * Quick-access chips/cards for top-level categories on the home page. Renders
 * nothing when there are no categories (graceful empty state).
 */
export function CategoryShortcuts({ categories }: CategoryShortcutsProps) {
  if (categories.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-neutral-900">
          Shop by category
        </h2>
        <Link
          href="/categories"
          className="text-sm font-medium text-primary-700 transition-colors hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          View all
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={`/categories/${category.slug}`}
              className="flex items-center justify-center rounded-lg border border-neutral-200 bg-neutral-0 px-4 py-5 text-center text-sm font-medium text-neutral-900 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
