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
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {product.brand && (
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            {product.brand}
          </span>
        )}
        <h3 className="line-clamp-2 text-base font-medium text-neutral-900 transition-colors group-hover:text-primary-700">
          {product.name}
        </h3>
        <div className="mt-auto pt-1">
          <Price price={product.price} salePrice={product.salePrice} />
        </div>
      </div>
    </Link>
  );
}
