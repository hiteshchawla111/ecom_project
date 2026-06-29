'use client';

import { useState } from 'react';
import type { ProductImage } from '@/lib/catalog';
import { placeholderImage } from './product-image';

export interface ProductGalleryProps {
  images: ProductImage[];
  /** Alt text used when an image has none (typically the product name). */
  fallbackAlt: string;
  /** Product id — seeds a deterministic placeholder when there are no images,
   *  so the gallery shows a real photo instead of an empty frame. */
  productId: string;
}

/**
 * Product image gallery: a large main image plus a thumbnail strip. Clicking a
 * thumbnail swaps the main image. Renders a placeholder when there are no
 * images and hides thumbnails when there is only one. Plain <img> (catalog
 * image domains are unconfigured for next/image — a later optimization).
 */
export function ProductGallery({
  images,
  fallbackAlt,
  productId,
}: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // No real images → show a deterministic placeholder photo (same seed as the
  // catalog card) so the gallery never renders an empty grey frame.
  if (images.length === 0) {
    return (
      <div className="aspect-[4/5] w-full overflow-hidden border border-line bg-surface-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="gallery-main"
          src={placeholderImage(productId)}
          alt={fallbackAlt}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  const active = images[activeIndex] ?? images[0];

  return (
    <div className="flex flex-col gap-4 sm:flex-row-reverse sm:items-start">
      <div className="aspect-[4/5] w-full overflow-hidden border border-line bg-surface-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="gallery-main"
          src={active.url}
          alt={active.alt ?? fallbackAlt}
          className="h-full w-full object-cover"
        />
      </div>

      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2 sm:flex sm:w-20 sm:flex-shrink-0 sm:flex-col">
          {images.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <li key={image.id}>
                <button
                  type="button"
                  aria-label={`View image ${index + 1}`}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => setActiveIndex(index)}
                  className={`aspect-square w-full overflow-hidden border bg-surface-muted transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 ${
                    isActive
                      ? 'border-content opacity-100'
                      : 'border-line opacity-60 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.alt ?? fallbackAlt}
                    className="h-full w-full object-cover"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
