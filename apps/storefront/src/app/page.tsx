import { getProducts, getCategoryTree } from '@/lib/catalog';
import type { Product, Category } from '@/lib/catalog';
import { ProductCard } from '@/components/catalog/ProductCard';
import { Hero } from '@/components/home/Hero';
import { CategoryShortcuts } from '@/components/home/CategoryShortcuts';

/** Number of newest products to feature on the home page. */
const FEATURED_COUNT = 8;
/** Top-level categories to surface as quick shortcuts. */
const SHORTCUT_COUNT = 6;

/**
 * Home page. Fetches newest products + the category tree from the public API.
 * Both fetches degrade gracefully — if the API is unavailable, the page still
 * renders the hero and simply hides the data-backed sections.
 */
export default async function Home() {
  const [featured, categories] = await Promise.all([
    fetchFeatured(),
    fetchCategories(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-12 px-4 py-10">
      <Hero />

      {featured.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold text-content">
              New arrivals
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      <CategoryShortcuts categories={categories.slice(0, SHORTCUT_COUNT)} />
    </main>
  );
}

/** Newest active products; empty array if the API is unavailable. */
async function fetchFeatured(): Promise<Product[]> {
  try {
    const { data } = await getProducts({
      sortBy: 'createdAt',
      sortDir: 'desc',
      status: 'ACTIVE',
      pageSize: FEATURED_COUNT,
    });
    return data;
  } catch {
    return [];
  }
}

/** Top-level categories; empty array if the API is unavailable. */
async function fetchCategories(): Promise<Category[]> {
  try {
    return await getCategoryTree();
  } catch {
    return [];
  }
}
