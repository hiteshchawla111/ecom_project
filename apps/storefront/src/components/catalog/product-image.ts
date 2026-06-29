import type { Product } from '@/lib/catalog';

/**
 * Deterministic placeholder image for products without one, so every product
 * shows a realistic photo. Seeded by product id → the same product always gets
 * the same image (stable across renders and pages). Loaded via a plain <img>,
 * so it needs no next/image remote-domain allowlist.
 */
export function placeholderImage(productId: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(productId)}/600/600`;
}

/** The product's first real image, or its deterministic placeholder. */
export function productImageUrl(product: Pick<Product, 'id' | 'images'>): string {
  return product.images?.[0]?.url ?? placeholderImage(product.id);
}
