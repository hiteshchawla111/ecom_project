import Link from 'next/link';
import type { Product } from '@/lib/catalog';
import { isOnSale } from '@/lib/money';
import { Price } from './Price';

interface ProductCardProps {
  product: Product;
}

/**
 * Deterministic placeholder image for products without one, so every card
 * shows a realistic photo. Seeded by product id → the same product always gets
 * the same image (stable across renders and pages). Loaded via a plain <img>,
 * so it needs no next/image remote-domain allowlist.
 */
function placeholderImage(productId: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(productId)}/600/600`;
}

/**
 * Catalog grid card: image, brand, name, price. Links to the product detail
 * page. Equal-height by design — the card fills its grid cell (`h-full`), the
 * image is a fixed square, and the body uses flex so the price always pins to
 * the bottom regardless of brand/name length. A reserved brand line keeps the
 * name/price baselines aligned across cards even when a product has no brand.
 * Real product images take priority; products without one fall back to a
 * deterministic placeholder. Styling follows DESIGN.md (neutral surface/border,
 * rounded, subtle hover lift).
 */
export function ProductCard({ product }: ProductCardProps) {
  const image = product.images?.[0];
  const src = image?.url ?? placeholderImage(product.id);
  const alt = image?.alt ?? product.name;
  const onSale = isOnSale(product.price, product.salePrice);

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary-300 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-surface-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
        />
        {onSale && (
          <span
            data-testid="sale-ribbon"
            className="absolute left-3 top-3 rounded-full bg-accent-600 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-surface shadow-sm"
          >
            Sale
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        {product.brand ? (
          <span className="text-xs font-medium uppercase tracking-wide text-content-subtle">
            {product.brand}
          </span>
        ) : (
          <span className="h-4" aria-hidden="true" />
        )}
        <h3 className="line-clamp-2 min-h-11 text-base font-medium leading-snug text-content transition-colors group-hover:text-primary-700">
          {product.name}
        </h3>
        <div className="mt-auto pt-2">
          <Price
            price={product.price}
            salePrice={product.salePrice}
            className="font-heading"
          />
        </div>
      </div>
    </Link>
  );
}
