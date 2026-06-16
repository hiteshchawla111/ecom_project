import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProductById } from '@/lib/catalog';
import { Price } from '@/components/catalog/Price';

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

  const image = product.images?.[0];
  const available = product.status === 'ACTIVE';

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 md:flex-row">
      <div className="w-full md:w-1/2">
        <div className="aspect-square w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt={image.alt ?? product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-neutral-400"
              aria-hidden="true"
            >
              No image
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full flex-col gap-4 md:w-1/2">
        {product.brand && (
          <span className="text-sm font-medium uppercase tracking-wide text-neutral-600">
            {product.brand}
          </span>
        )}
        <h1 className="text-3xl font-bold text-neutral-900">{product.name}</h1>

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

        <p className="whitespace-pre-line text-neutral-900">
          {product.description}
        </p>
      </div>
    </main>
  );
}
