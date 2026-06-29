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
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 pb-24 pt-12">
      <header className="flex flex-col items-center gap-5 border-b border-line pb-10 text-center">
        {seller.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={seller.logoUrl}
            alt={`${seller.displayName} logo`}
            className="size-20 rounded-full border border-line object-cover"
          />
        ) : (
          <span className="flex size-20 items-center justify-center rounded-full border border-line bg-surface-muted font-heading text-3xl font-medium text-content">
            {seller.displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="text-xs font-medium uppercase tracking-[0.28em] text-content-subtle">
          Shop
        </span>
        <h1 className="font-heading text-4xl font-medium tracking-[-0.01em] text-content sm:text-5xl">
          {seller.displayName}
        </h1>
        {seller.description && (
          <p className="max-w-xl text-base leading-relaxed text-content-muted">
            {seller.description}
          </p>
        )}
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-content-subtle">
          {total} {total === 1 ? 'product' : 'products'}
        </p>
      </header>

      {data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border border-line bg-surface py-20 text-center">
          <p className="font-heading text-2xl font-medium text-content">
            No products yet.
          </p>
          <p className="text-sm text-content-muted">
            This shop hasn’t listed anything for sale.
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
        hrefForPage={(p) => `/seller/${slug}?page=${p}`}
      />
    </main>
  );
}
