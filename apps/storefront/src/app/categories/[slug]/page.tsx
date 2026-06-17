import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCategoryByIdOrSlug, getProducts } from '@/lib/catalog';
import { ProductCard } from '@/components/catalog/ProductCard';
import { Pagination } from '@/components/catalog/Pagination';

type Params = { slug: string };
type Search = { page?: string | string[] };

const PAGE_SIZE = 12;

function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryByIdOrSlug(slug);
  if (!category) return { title: 'Category not found' };
  return {
    title: category.name,
    description: `Browse ${category.name} products.`,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const category = await getCategoryByIdOrSlug(slug);
  if (!category) notFound();

  const page = parsePage((await searchParams).page);
  const { data, total, totalPages } = await getProducts({
    categoryId: category.id,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href="/categories"
          className="w-fit text-sm font-medium text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          ← All categories
        </Link>
        <h1 className="text-2xl font-semibold text-neutral-900">
          {category.name}
        </h1>
        <p className="text-sm text-neutral-600">
          {total} {total === 1 ? 'product' : 'products'}
        </p>
      </header>

      {category.children && category.children.length > 0 && (
        <nav aria-label="Subcategories" className="flex flex-wrap gap-2">
          {category.children.map((child) => (
            <Link
              key={child.id}
              href={`/categories/${child.slug}`}
              className="rounded-full border border-neutral-200 px-3 py-1 text-sm text-neutral-900 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            >
              {child.name}
            </Link>
          ))}
        </nav>
      )}

      {data.length === 0 ? (
        <p className="text-neutral-600">No products in this category yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        hrefForPage={(p) => `/categories/${slug}?page=${p}`}
      />
    </main>
  );
}
