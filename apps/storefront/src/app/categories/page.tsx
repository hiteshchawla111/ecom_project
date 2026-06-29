import type { Metadata } from 'next';
import { getCategoryTree } from '@/lib/catalog';
import { CategoryTiles } from '@/components/catalog/CategoryTiles';

export const metadata: Metadata = {
  title: 'Browse categories',
  description: 'Browse products by category.',
};

export default async function CategoriesPage() {
  const categories = await getCategoryTree();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 pb-24 pt-12">
      <header className="flex flex-col gap-3 border-b border-line pb-8">
        <span className="text-xs font-medium uppercase tracking-[0.28em] text-content-subtle">
          Browse
        </span>
        <h1 className="font-heading text-4xl font-medium tracking-[-0.01em] text-content sm:text-5xl">
          Shop by category
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-content-muted">
          Explore the full catalog, organized by category.
        </p>
      </header>

      {categories.length === 0 ? (
        <p className="border border-line bg-surface p-6 text-content-muted">
          No categories yet.
        </p>
      ) : (
        <nav aria-label="Product categories">
          <CategoryTiles categories={categories} />
        </nav>
      )}
    </main>
  );
}
