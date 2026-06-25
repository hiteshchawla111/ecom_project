import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RelatedProducts } from './RelatedProducts';
import type { Product } from '@/lib/catalog';

const make = (id: string, name: string): Product => ({
  id,
  name,
  sku: `SKU-${id}`,
  description: 'x',
  price: '10',
  salePrice: null,
  brand: null,
  status: 'ACTIVE',
  categoryId: 'c1',
  images: [],
  ratingAvg: null,
  ratingCount: 0,
});

describe('RelatedProducts', () => {
  it('renders a heading and a card per related product', () => {
    render(
      <RelatedProducts products={[make('p2', 'Phone B'), make('p3', 'Phone C')]} />,
    );
    expect(
      screen.getByRole('heading', { name: /related products/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /phone b/i })).toHaveAttribute(
      'href',
      '/products/p2',
    );
    expect(screen.getByRole('link', { name: /phone c/i })).toBeInTheDocument();
  });

  it('renders nothing when there are no related products', () => {
    const { container } = render(<RelatedProducts products={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
