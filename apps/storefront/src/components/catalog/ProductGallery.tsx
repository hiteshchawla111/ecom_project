'use client';

import { useState } from 'react';
import type { ProductImage } from '@/lib/catalog';

export interface ProductGalleryProps {
  images: ProductImage[];
  /** Alt text used when an image has none (typically the product name). */
  fallbackAlt: string;
}

/**
 * Product image gallery: a large main image plus a thumbnail strip. Clicking a
 * thumbnail swaps the main image. Renders a placeholder when there are no
 * images and hides thumbnails when there is only one. Plain <img> (catalog
 * image domains are unconfigured for next/image — a later optimization).
 */
export function ProductGallery({ images, fallbackAlt }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="aspect-square w-full overflow-hidden rounded-lg border border-line bg-surface-muted">
        <div
          className="flex h-full w-full items-center justify-center text-content-subtle"
          aria-hidden="true"
        >
          No image
        </div>
      </div>
    );
  }

  const active = images[activeIndex] ?? images[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-square w-full overflow-hidden rounded-lg border border-line bg-surface-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="gallery-main"
          src={active.url}
          alt={active.alt ?? fallbackAlt}
          className="h-full w-full object-cover"
        />
      </div>

      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2">
          {images.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <li key={image.id}>
                <button
                  type="button"
                  aria-label={`View image ${index + 1}`}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => setActiveIndex(index)}
                  className={`aspect-square w-full overflow-hidden rounded-md border bg-surface-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 ${
                    isActive
                      ? 'border-primary-500 ring-1 ring-primary-500'
                      : 'border-line hover:border-primary-300'
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
