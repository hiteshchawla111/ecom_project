import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProductById, getRelatedProductsFor } from '@/lib/catalog';
import { Price } from '@/components/catalog/Price';
import { ProductGallery } from '@/components/catalog/ProductGallery';
import { RelatedProducts } from '@/components/catalog/RelatedProducts';
import { SellerLink } from '@/components/catalog/SellerLink';
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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
        <div className="md:sticky md:top-24 md:self-start">
          <ProductGallery
            images={product.images ?? []}
            fallbackAlt={product.name}
          />
        </div>

        <div className="flex w-full flex-col gap-4">
          {product.brand && (
            <span className="text-sm font-medium uppercase tracking-wide text-content-muted">
              {product.brand}
            </span>
          )}
          <h1 className="text-3xl font-bold text-content">
            {product.name}
          </h1>

          <SellerLink seller={product.seller} />

          <Price
            price={product.price}
            salePrice={product.salePrice}
            className="text-xl"
          />

          <p
            className={
              available
                ? 'inline-flex w-fit items-center gap-1.5 rounded-full bg-success-500/10 px-3 py-1 text-sm font-medium text-success-500'
                : 'inline-flex w-fit items-center gap-1.5 rounded-full bg-error-500/10 px-3 py-1 text-sm font-medium text-error-500'
            }
          >
            {available ? 'In stock' : 'Unavailable'}
          </p>

          <AddToCartButton productId={product.id} disabled={!available} />

          <div className="mt-2 border-t border-line pt-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-content-muted">
              Description
            </h2>
            <p className="whitespace-pre-line text-content">
              {product.description}
            </p>
          </div>
        </div>
      </div>

      <RelatedProducts products={related} />
    </main>
  );
}
