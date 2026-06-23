import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CategoryTiles } from './CategoryTiles';
import type { Category } from '@/lib/catalog';

const tree: Category[] = [
  {
    id: 'c1',
    name: 'Electronics',
    slug: 'electronics',
    parentId: null,
    children: [
      { id: 'c2', name: 'Phones', slug: 'phones', parentId: 'c1', children: [] },
      {
        id: 'c3',
        name: 'Laptops',
        slug: 'laptops',
        parentId: 'c1',
        children: [],
      },
    ],
  },
  {
    id: 'c4',
    name: 'Apparel',
    slug: 'apparel',
    parentId: null,
    children: [],
  },
];

describe('CategoryTiles', () => {
  it('renders each top-level category as a tile linking to its slug page', () => {
    render(<CategoryTiles categories={tree} />);
    expect(
      screen.getByRole('link', { name: /electronics/i }),
    ).toHaveAttribute('href', '/categories/electronics');
    expect(screen.getByRole('link', { name: /apparel/i })).toHaveAttribute(
      'href',
      '/categories/apparel',
    );
  });

  it('shows the real subcategory count when a category has children', () => {
    render(<CategoryTiles categories={tree} />);
    const electronics = screen
      .getByRole('link', { name: /electronics/i })
      .closest('a') as HTMLElement;
    // 2 children → "2 subcategories" (real data, not a fabricated product count)
    expect(within(electronics).getByText(/2 subcategories/i)).toBeInTheDocument();
  });

  it('does not show a subcategory count for a category with no children', () => {
    render(<CategoryTiles categories={tree} />);
    const apparel = screen
      .getByRole('link', { name: /apparel/i })
      .closest('a') as HTMLElement;
    expect(within(apparel).queryByText(/subcategor/i)).not.toBeInTheDocument();
  });

  it('links each subcategory to its own slug page', () => {
    render(<CategoryTiles categories={tree} />);
    expect(screen.getByRole('link', { name: /phones/i })).toHaveAttribute(
      'href',
      '/categories/phones',
    );
    expect(screen.getByRole('link', { name: /laptops/i })).toHaveAttribute(
      'href',
      '/categories/laptops',
    );
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<CategoryTiles categories={[]} />);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});
