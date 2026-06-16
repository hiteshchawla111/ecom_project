import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CatalogFilters } from './CatalogFilters';
import type { Category } from '@/lib/catalog';

const categories: Category[] = [
  {
    id: 'c1',
    name: 'Electronics',
    slug: 'electronics',
    parentId: null,
    children: [
      { id: 'c2', name: 'Phones', slug: 'phones', parentId: 'c1', children: [] },
    ],
  },
];

describe('CatalogFilters', () => {
  it('submits to /products via GET', () => {
    const { container } = render(<CatalogFilters categories={categories} />);
    const form = container.querySelector('form')!;
    expect(form.getAttribute('method')?.toLowerCase()).toBe('get');
    expect(form.getAttribute('action')).toBe('/products');
  });

  it('renders search, sort, price and category controls', () => {
    render(<CatalogFilters categories={categories} />);
    expect(screen.getByRole('searchbox', { name: /search/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/sort/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/min price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max price/i)).toBeInTheDocument();
  });

  it('lists categories (including nested) as options', () => {
    render(<CatalogFilters categories={categories} />);
    expect(
      screen.getByRole('option', { name: /electronics/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /phones/i })).toBeInTheDocument();
  });

  it('preselects the current filter values', () => {
    render(
      <CatalogFilters
        categories={categories}
        current={{
          search: 'phone',
          categoryId: 'c2',
          sortBy: 'price',
          sortDir: 'asc',
          minPrice: 100,
          maxPrice: 900,
        }}
      />,
    );
    expect(screen.getByRole('searchbox', { name: /search/i })).toHaveValue(
      'phone',
    );
    expect(screen.getByLabelText(/category/i)).toHaveValue('c2');
    expect(screen.getByLabelText(/min price/i)).toHaveValue(100);
    expect(screen.getByLabelText(/max price/i)).toHaveValue(900);
    // Sort encodes column+direction in one select value.
    expect(screen.getByLabelText(/sort/i)).toHaveValue('price:asc');
  });

  it('offers a way to clear filters', () => {
    render(<CatalogFilters categories={categories} current={{ search: 'x' }} />);
    expect(screen.getByRole('link', { name: /clear/i })).toHaveAttribute(
      'href',
      '/products',
    );
  });
});
