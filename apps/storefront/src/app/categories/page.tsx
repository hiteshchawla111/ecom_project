import type { Metadata } from 'next';
import { getCategoryTree } from '@/lib/catalog';
import { CategoryTree } from '@/components/catalog/CategoryTree';

export const metadata: Metadata = {
  title: 'Browse categories',
  description: 'Browse products by category.',
};

export default async function CategoriesPage() {
  const categories = await getCategoryTree();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-neutral-900">Categories</h1>
        <p className="text-base text-neutral-600">
          Browse the full catalog by category.
        </p>
      </header>

      {categories.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-neutral-0 p-6 text-neutral-600">
          No categories yet.
        </p>
      ) : (
        <nav
          aria-label="Product categories"
          className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm sm:p-6"
        >
          <CategoryTree categories={categories} />
        </nav>
      )}
    </main>
  );
}
