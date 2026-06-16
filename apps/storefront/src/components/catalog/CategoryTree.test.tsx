import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CategoryTree } from './CategoryTree';
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
];

describe('CategoryTree', () => {
  it('renders each category as a link to its slug page', () => {
    render(<CategoryTree categories={tree} />);
    expect(
      screen.getByRole('link', { name: /electronics/i }),
    ).toHaveAttribute('href', '/categories/electronics');
    expect(screen.getByRole('link', { name: /phones/i })).toHaveAttribute(
      'href',
      '/categories/phones',
    );
    expect(screen.getByRole('link', { name: /laptops/i })).toHaveAttribute(
      'href',
      '/categories/laptops',
    );
  });

  it('nests children under their parent', () => {
    render(<CategoryTree categories={tree} />);
    // The Electronics <li> should contain the Phones child link.
    const electronicsItem = screen
      .getByRole('link', { name: /electronics/i })
      .closest('li') as HTMLElement;
    expect(
      within(electronicsItem).getByRole('link', { name: /phones/i }),
    ).toBeInTheDocument();
  });

  it('renders nothing notable for an empty tree', () => {
    const { container } = render(<CategoryTree categories={[]} />);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});
