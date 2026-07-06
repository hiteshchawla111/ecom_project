import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProductById, getRelatedProductsFor } from '@/lib/catalog';
import { discountPercent } from '@/lib/money';
import { Price } from '@/components/catalog/Price';
import { ProductGallery } from '@/components/catalog/ProductGallery';
import { RelatedProducts } from '@/components/catalog/RelatedProducts';
import { SellerLink } from '@/components/catalog/SellerLink';
import { RatingStars } from '@/components/catalog/RatingStars';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { ProductReviews } from '@/components/reviews/ProductReviews';

type Params = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) return { title: 'Product not found' };
  return { title: product.name, description: product.description };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) notFound();

  const available = product.status === 'ACTIVE';
  const off = discountPercent(product.price, product.salePrice);
  const related = await getRelatedProductsFor(product.categoryId, product.id);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-20 px-4 pb-24 pt-10">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-content-subtle"
      >
        <Link href="/products" className="transition-colors hover:text-content">
          Shop
        </Link>
        <span aria-hidden="true">/</span>
        {product.category && (
          <>
            <Link
              href={`/categories/${product.category.slug}`}
              className="transition-colors hover:text-content"
            >
              {product.category.name}
            </Link>
            <span aria-hidden="true">/</span>
          </>
        )}
        <span className="text-content-muted">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:self-start">
          <ProductGallery
            images={product.images ?? []}
            fallbackAlt={product.name}
            productId={product.id}
          />
        </div>

        <div className="flex w-full flex-col gap-6">
          {product.brand && (
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-content-subtle">
              {product.brand}
            </span>
          )}
          <h1 className="font-heading text-4xl font-medium leading-tight tracking-[-0.01em] text-content sm:text-5xl">
            {product.name}
          </h1>

          <RatingStars
            ratingAvg={product.ratingAvg}
            ratingCount={product.ratingCount}
          />

          <div className="flex items-center gap-3">
            <Price
              price={product.price}
              salePrice={product.salePrice}
              className="text-2xl"
            />
            {off !== null && (
              <span className="bg-accent-600 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-surface">
                −{off}%
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${available ? 'bg-success-500' : 'bg-error-500'}`}
            />
            <span className={available ? 'text-content-muted' : 'text-error-600'}>
              {available ? 'In stock — ready to ship' : 'Currently unavailable'}
            </span>
          </div>

          <div className="flex flex-col gap-4 border-t border-line pt-6">
            <AddToCartButton productId={product.id} disabled={!available} />
            <SellerLink seller={product.seller} />
          </div>

          {/* Reassurance block — quiet trust signals beside the buy action. */}
          <ul className="grid grid-cols-1 gap-px overflow-hidden border border-line bg-line sm:grid-cols-3">
            {PDP_ASSURANCES.map((a) => (
              <li
                key={a.label}
                className="flex flex-col gap-1.5 bg-surface p-4 text-center"
              >
                <span className="mx-auto text-content-muted">{a.icon}</span>
                <span className="text-[0.7rem] font-medium uppercase tracking-[0.1em] text-content">
                  {a.label}
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t border-line pt-6">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-content-subtle">
              Description
            </h2>
            <p className="whitespace-pre-line leading-relaxed text-content">
              {product.description}
            </p>
          </div>

          <dl className="divide-y divide-line border-t border-line text-sm">
            {product.brand && (
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-content-muted">Brand</dt>
                <dd className="font-medium text-content">{product.brand}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-content-muted">SKU</dt>
              <dd className="font-medium tabular-nums text-content">
                {product.sku}
              </dd>
            </div>
            {product.category && (
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-content-muted">Category</dt>
                <dd className="font-medium text-content">
                  {product.category.name}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <ProductReviews productId={product.id} />

      <RelatedProducts products={related} />
    </main>
  );
}

/** Static reassurance items shown beside the buy action. */
const PDP_ASSURANCES = [
  {
    label: 'Free shipping over $50',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
        <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
      </svg>
    ),
  },
  {
    label: '30-day returns',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" />
      </svg>
    ),
  },
  {
    label: 'Secure checkout',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
        <path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5z" />
      </svg>
    ),
  },
] as const;
