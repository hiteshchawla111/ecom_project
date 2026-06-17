import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { ProductImage } from '@/lib/catalog';
import { ProductGallery } from './ProductGallery';

const images: ProductImage[] = [
  { id: 'i1', url: 'https://x/a.jpg', alt: 'Front', position: 0 },
  { id: 'i2', url: 'https://x/b.jpg', alt: 'Back', position: 1 },
];

describe('ProductGallery', () => {
  it('renders a placeholder when there are no images', () => {
    render(<ProductGallery images={[]} fallbackAlt="Aurora Phone" />);
    expect(screen.getByText(/no image/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the first image as the main image initially', () => {
    render(<ProductGallery images={images} fallbackAlt="Aurora Phone" />);
    const main = screen.getByTestId('gallery-main');
    expect(main).toHaveAttribute('src', 'https://x/a.jpg');
    expect(main).toHaveAttribute('alt', 'Front');
  });

  it('does not render thumbnails for a single image', () => {
    render(<ProductGallery images={[images[0]]} fallbackAlt="Aurora Phone" />);
    expect(
      screen.queryByRole('button', { name: /view image/i }),
    ).not.toBeInTheDocument();
  });

  it('renders a thumbnail button per image and swaps the main image on click', () => {
    render(<ProductGallery images={images} fallbackAlt="Aurora Phone" />);
    const thumbs = screen.getAllByRole('button', { name: /view image/i });
    expect(thumbs).toHaveLength(2);

    fireEvent.click(thumbs[1]);
    const main = screen.getByTestId('gallery-main');
    expect(main).toHaveAttribute('src', 'https://x/b.jpg');
    expect(main).toHaveAttribute('alt', 'Back');
  });

  it('falls back to the product name for alt when an image has none', () => {
    render(
      <ProductGallery
        images={[{ id: 'i1', url: 'https://x/a.jpg', alt: null, position: 0 }]}
        fallbackAlt="Aurora Phone"
      />,
    );
    expect(screen.getByTestId('gallery-main')).toHaveAttribute(
      'alt',
      'Aurora Phone',
    );
  });
});
