import Link from 'next/link';
import type { Product } from '@/lib/catalog';
import { Price } from './Price';

interface ProductCardProps {
  product: Product;
}

/**
 * Catalog grid card: image, name, price. Links to the product detail page.
 * Uses a plain <img> (catalog image URLs are external/unconfigured for now;
 * next/image remote domains are a later optimization). Card styling follows
 * DESIGN.md: neutral-0 surface, neutral-200 border, rounded-lg, shadow-sm.
 */
export function ProductCard({ product }: ProductCardProps) {
  const image = product.images?.[0];
  const alt = image?.alt ?? product.name;

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
    >
      <div className="aspect-square w-full overflow-hidden bg-neutral-100">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={alt}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-sm text-neutral-400"
            aria-hidden="true"
          >
            No image
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        <h3 className="text-base font-medium text-neutral-900">
          {product.name}
        </h3>
        <Price price={product.price} salePrice={product.salePrice} />
      </div>
    </Link>
  );
}
