import type { Product } from '@/lib/catalog';
import { ProductCard } from './ProductCard';

interface RelatedProductsProps {
  products: Product[];
}

/**
 * "Related products" strip for the detail page — other products in the same
 * category. Renders nothing when there are none, so the section never shows an
 * empty header.
 */
export function RelatedProducts({ products }: RelatedProductsProps) {
  if (products.length === 0) return null;

  return (
    <section className="flex flex-col gap-8" aria-labelledby="related-heading">
      <div className="flex flex-col gap-1.5 border-b border-line pb-5">
        <span className="text-xs font-medium uppercase tracking-[0.28em] text-content-subtle">
          You may also like
        </span>
        <h2
          id="related-heading"
          className="font-heading text-3xl font-medium tracking-[-0.01em] text-content sm:text-4xl"
        >
          Related products
        </h2>
      </div>
      <ul className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <li key={product.id} className="flex">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}
