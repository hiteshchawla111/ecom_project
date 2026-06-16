import Link from 'next/link';
import type { Category } from '@/lib/catalog';

interface CategoryTreeProps {
  categories: Category[];
}

/**
 * Renders the category hierarchy as nested lists of links. Each category links
 * to its slug-based browse page. Children render recursively underneath.
 */
export function CategoryTree({ categories }: CategoryTreeProps) {
  return (
    <ul className="flex flex-col gap-1">
      {categories.map((category) => (
        <li key={category.id}>
          <Link
            href={`/categories/${category.slug}`}
            className="inline-block rounded-md px-2 py-1 text-neutral-900 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            {category.name}
          </Link>
          {category.children && category.children.length > 0 && (
            <div className="ml-4 border-l border-neutral-200 pl-2">
              <CategoryTree categories={category.children} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
