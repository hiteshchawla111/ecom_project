import Link from 'next/link';
import type { Category } from '@/lib/catalog';

interface CategoryTreeProps {
  categories: Category[];
  /** Nesting depth — drives the visual hierarchy (0 = top level). */
  depth?: number;
}

/**
 * Renders the category hierarchy as nested lists of links. Each category links
 * to its slug-based browse page; children render recursively underneath with a
 * guide line. Top-level rows read heavier than nested ones.
 */
export function CategoryTree({ categories, depth = 0 }: CategoryTreeProps) {
  const isTop = depth === 0;

  return (
    <ul className={isTop ? 'flex flex-col gap-1' : 'flex flex-col'}>
      {categories.map((category) => {
        const hasChildren =
          Boolean(category.children) && category.children!.length > 0;

        return (
          <li key={category.id}>
            <Link
              href={`/categories/${category.slug}`}
              className={`group flex items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 ${
                isTop
                  ? 'font-heading text-base font-semibold text-content'
                  : 'text-sm text-content-muted hover:text-content'
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-block shrink-0 rounded-full ${
                  isTop
                    ? 'h-2 w-2 bg-primary-500'
                    : 'h-1.5 w-1.5 bg-line group-hover:bg-primary-500'
                }`}
              />
              <span className="truncate">{category.name}</span>
            </Link>

            {hasChildren && (
              <div className="ml-4 border-l border-line pl-2">
                <CategoryTree categories={category.children!} depth={depth + 1} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
