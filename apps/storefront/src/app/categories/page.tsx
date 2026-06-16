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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-900">Categories</h1>
        <p className="text-sm text-neutral-600">Browse products by category.</p>
      </header>

      {categories.length === 0 ? (
        <p className="text-neutral-600">No categories yet.</p>
      ) : (
        <nav aria-label="Product categories">
          <CategoryTree categories={categories} />
        </nav>
      )}
    </main>
  );
}
