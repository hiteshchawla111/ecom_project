import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductCard } from './ProductCard';
import type { Product } from '@/lib/catalog';

const base: Product = {
  id: 'p1',
  name: 'Aurora Phone',
  sku: 'PH-001',
  description: 'A phone',
  price: '799',
  salePrice: null,
  brand: 'Aurora',
  status: 'ACTIVE',
  categoryId: 'c1',
  images: [],
};

describe('ProductCard', () => {
  it('links to the product detail page', () => {
    render(<ProductCard product={base} />);
    const link = screen.getByRole('link', { name: /aurora phone/i });
    expect(link).toHaveAttribute('href', '/products/p1');
  });

  it('shows the product name and price', () => {
    render(<ProductCard product={base} />);
    expect(screen.getByText('Aurora Phone')).toBeInTheDocument();
    expect(screen.getByText('$799.00')).toBeInTheDocument();
  });

  it('renders the sale price when on sale', () => {
    render(<ProductCard product={{ ...base, salePrice: '699' }} />);
    expect(screen.getByText('$699.00')).toBeInTheDocument();
    expect(screen.getByText(/sale/i)).toBeInTheDocument();
  });

  it('renders the first image with its alt text', () => {
    render(
      <ProductCard
        product={{
          ...base,
          images: [
            { id: 'i1', url: 'https://x/img.jpg', alt: 'Front view', position: 0 },
          ],
        }}
      />,
    );
    expect(screen.getByAltText('Front view')).toBeInTheDocument();
  });

  it('shows the brand when present', () => {
    render(<ProductCard product={base} />);
    expect(screen.getByText('Aurora')).toBeInTheDocument();
  });

  it('omits the brand line when the product has no brand', () => {
    render(<ProductCard product={{ ...base, brand: null }} />);
    expect(screen.queryByText('Aurora')).not.toBeInTheDocument();
  });

  it('falls back to the product name for image alt when none is provided', () => {
    render(
      <ProductCard
        product={{
          ...base,
          images: [{ id: 'i1', url: 'https://x/img.jpg', alt: null, position: 0 }],
        }}
      />,
    );
    expect(screen.getByAltText('Aurora Phone')).toBeInTheDocument();
  });
});
