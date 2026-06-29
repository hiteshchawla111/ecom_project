import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProductById, getRelatedProductsFor } from '@/lib/catalog';
import { Price } from '@/components/catalog/Price';
import { ProductGallery } from '@/components/catalog/ProductGallery';
import { RelatedProducts } from '@/components/catalog/RelatedProducts';
import { SellerLink } from '@/components/catalog/SellerLink';
import { RatingStars } from '@/components/catalog/RatingStars';
import { AddToCartButton } from '@/components/cart/AddToCartButton';

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

          <Price
            price={product.price}
            salePrice={product.salePrice}
            className="text-2xl"
          />

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

          <div className="border-t border-line pt-6">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-content-subtle">
              Description
            </h2>
            <p className="whitespace-pre-line leading-relaxed text-content">
              {product.description}
            </p>
          </div>
        </div>
      </div>

      <RelatedProducts products={related} />
    </main>
  );
}
