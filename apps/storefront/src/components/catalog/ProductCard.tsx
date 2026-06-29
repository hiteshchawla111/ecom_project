import Link from 'next/link';
import type { Product } from '@/lib/catalog';
import { isOnSale } from '@/lib/money';
import { Price } from './Price';
import { productImageUrl } from './product-image';

interface ProductCardProps {
  product: Product;
  /**
   * Lead card in the editorial bento grid. Fills its (taller, 2×2) cell with a
   * full-bleed image and overlaid copy. Purely presentational — same link, same
   * data; only the layout differs.
   */
  featured?: boolean;
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
 *
 * The `featured` variant renders a full-bleed image-led tile for the lead slot
 * of the home bento grid.
 */
export function ProductCard({ product, featured = false }: ProductCardProps) {
  const image = product.images?.[0];
  const src = productImageUrl(product);
  const alt = image?.alt ?? product.name;
  const onSale = isOnSale(product.price, product.salePrice);

  if (featured) {
    return (
      <Link
        href={`/products/${product.id}`}
        className="group relative flex h-full min-h-[20rem] flex-col justify-end overflow-hidden rounded-2xl border border-line bg-surface-muted shadow-sm transition-all duration-300 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-neutral-900/80 via-neutral-900/20 to-transparent"
        />
        <div className="absolute left-4 top-4 flex gap-2">
          <span className="rounded-full bg-surface/95 px-3 py-1 text-xs font-bold uppercase tracking-wide text-content shadow-sm backdrop-blur">
            Featured
          </span>
          {onSale && (
            <span
              data-testid="sale-ribbon"
              className="rounded-full bg-accent-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-surface shadow-sm"
            >
              Sale
            </span>
          )}
        </div>
        <div className="relative flex flex-col gap-2 p-6">
          {product.brand && (
            <span className="text-xs font-semibold uppercase tracking-wide text-white/80">
              {product.brand}
            </span>
          )}
          <h3 className="font-heading text-xl font-bold leading-tight text-white sm:text-2xl">
            {product.name}
          </h3>
          <Price
            price={product.price}
            salePrice={product.salePrice}
            className="font-heading text-lg text-white [&_*]:!text-white"
          />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary-300 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
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
        {/* Quick affordance on hover — invites the click without changing it. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 bottom-3 translate-y-2 rounded-full bg-surface/95 py-2 text-center text-xs font-semibold text-content opacity-0 shadow-md backdrop-blur transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
        >
          View product
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        {product.brand ? (
          <span className="text-xs font-medium uppercase tracking-wide text-content-subtle">
            {product.brand}
          </span>
        ) : (
          <span className="h-4" aria-hidden="true" />
        )}
        <h3 className="line-clamp-2 min-h-11 text-base font-semibold leading-snug text-content transition-colors group-hover:text-primary-700">
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
