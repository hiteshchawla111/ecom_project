import Link from 'next/link';
import type { Metadata } from 'next';
import { getProducts } from '@/lib/catalog';
import { ProductCard } from '@/components/catalog/ProductCard';

export const metadata: Metadata = {
  title: 'Shop all products',
  description: 'Browse our full catalog of products.',
};

const PAGE_SIZE = 12;

/** Parse a positive integer page from the raw searchParam, defaulting to 1. */
function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { page: rawPage } = await searchParams;
  const page = parsePage(rawPage);

  const { data, total, totalPages } = await getProducts({
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-900">Shop</h1>
        <p className="text-sm text-neutral-600">
          {total} {total === 1 ? 'product' : 'products'}
        </p>
      </header>

      {data.length === 0 ? (
        <p className="text-neutral-600">No products found.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav
          className="flex items-center justify-between gap-4"
          aria-label="Pagination"
        >
          <PageLink
            page={page - 1}
            disabled={page <= 1}
            rel="prev"
          >
            Previous
          </PageLink>
          <span className="text-sm text-neutral-600">
            Page {page} of {totalPages}
          </span>
          <PageLink
            page={page + 1}
            disabled={page >= totalPages}
            rel="next"
          >
            Next
          </PageLink>
        </nav>
      )}
    </main>
  );
}

function PageLink({
  page,
  disabled,
  rel,
  children,
}: {
  page: number;
  disabled: boolean;
  rel: 'prev' | 'next';
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="rounded-md border border-neutral-200 px-4 py-2 text-sm text-neutral-400"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={`/products?page=${page}`}
      rel={rel}
      className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
    >
      {children}
    </Link>
  );
}
