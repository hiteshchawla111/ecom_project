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
    <section className="flex flex-col gap-4" aria-labelledby="related-heading">
      <h2
        id="related-heading"
        className="text-xl font-semibold text-content"
      >
        Related products
      </h2>
      <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <li key={product.id} className="flex">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}
