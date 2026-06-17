import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { Category } from '@/lib/catalog';
import { CategoryShortcuts } from './CategoryShortcuts';

const categories: Category[] = [
  { id: 'c1', name: 'Electronics', slug: 'electronics', parentId: null, children: [] },
  { id: 'c2', name: 'Home', slug: 'home', parentId: null, children: [] },
];

describe('CategoryShortcuts', () => {
  it('renders a link per category to its slug page', () => {
    render(<CategoryShortcuts categories={categories} />);
    expect(screen.getByRole('link', { name: /electronics/i })).toHaveAttribute(
      'href',
      '/categories/electronics',
    );
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute(
      'href',
      '/categories/home',
    );
  });

  it('renders nothing when there are no categories', () => {
    const { container } = render(<CategoryShortcuts categories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
