import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSellerBySlug, getSellerProducts } from '@/lib/catalog';
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
  const seller = await getSellerBySlug(slug);
  if (!seller) return { title: 'Seller not found' };
  return {
    title: seller.displayName,
    description: `Products sold by ${seller.displayName}.`,
  };
}

export default async function SellerPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const seller = await getSellerBySlug(slug);
  if (!seller) notFound();

  const page = parsePage((await searchParams).page);
  const { data, total, totalPages } = await getSellerProducts(slug, {
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        {seller.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={seller.logoUrl}
            alt={`${seller.displayName} logo`}
            className="h-16 w-16 rounded-lg object-cover"
          />
        )}
        <h1 className="text-2xl font-semibold text-content">
          {seller.displayName}
        </h1>
        {seller.description && (
          <p className="text-sm text-content-muted">{seller.description}</p>
        )}
        <p className="text-sm text-content-muted">
          {total} {total === 1 ? 'product' : 'products'}
        </p>
      </header>

      {data.length === 0 ? (
        <p className="text-content-muted">No products from this seller yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
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
        hrefForPage={(p) => `/seller/${slug}?page=${p}`}
      />
    </main>
  );
}
