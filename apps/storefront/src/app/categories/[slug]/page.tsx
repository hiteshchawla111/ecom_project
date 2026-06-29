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
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 pb-24 pt-12">
      <header className="flex flex-col gap-3 border-b border-line pb-8">
        <Link
          href="/categories"
          className="w-fit text-xs font-medium uppercase tracking-[0.16em] text-content-muted transition-colors duration-300 hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          ← All categories
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-heading text-4xl font-medium tracking-[-0.01em] text-content sm:text-5xl">
            {category.name}
          </h1>
          <p className="text-sm tabular-nums text-content-muted">
            {total} {total === 1 ? 'product' : 'products'}
          </p>
        </div>
      </header>

      {category.children && category.children.length > 0 && (
        <nav aria-label="Subcategories" className="flex flex-wrap gap-2">
          {category.children.map((child) => (
            <Link
              key={child.id}
              href={`/categories/${child.slug}`}
              className="border border-line px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.1em] text-content-muted transition-colors duration-200 hover:border-content hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            >
              {child.name}
            </Link>
          ))}
        </nav>
      )}

      {data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border border-line bg-surface py-20 text-center">
          <p className="font-heading text-2xl font-medium text-content">
            Nothing here yet.
          </p>
          <p className="text-sm text-content-muted">
            This category has no products at the moment.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((product) => (
            <li key={product.id} className="flex">
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
