import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CatalogFilters, buildFacetHref } from './CatalogFilters';
import type { Category, SearchFacets } from '@/lib/catalog';

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
    const { container } = render(<CatalogFilters categories={categories} />);
    expect(screen.getByRole('searchbox', { name: /search/i })).toBeInTheDocument();
    // Sort + Category are shadcn Select triggers (buttons with aria-label),
    // each backed by a hidden input carrying the submitted value.
    expect(screen.getByRole('combobox', { name: /sort/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /category/i })).toBeInTheDocument();
    expect(container.querySelector('input[name="sort"]')).toBeInTheDocument();
    expect(container.querySelector('input[name="category"]')).toBeInTheDocument();
    expect(screen.getByLabelText(/min price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max price/i)).toBeInTheDocument();
  });

  it('preselects the current filter values', () => {
    const { container } = render(
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
    expect(screen.getByLabelText(/min price/i)).toHaveValue(100);
    expect(screen.getByLabelText(/max price/i)).toHaveValue(900);
    // The hidden inputs carry the submitted category + sort values.
    expect(container.querySelector('input[name="category"]')).toHaveValue('c2');
    expect(container.querySelector('input[name="sort"]')).toHaveValue(
      'price:asc',
    );
  });

  it('offers a way to clear filters', () => {
    render(<CatalogFilters categories={categories} current={{ search: 'x' }} />);
    expect(screen.getByRole('link', { name: /clear/i })).toHaveAttribute(
      'href',
      '/products',
    );
  });
});

const facets: SearchFacets = {
  brands: [
    { value: 'Acme', count: 3 },
    { value: 'Beta', count: 1 },
  ],
  categories: [{ categoryId: 'c1', name: 'Phones', count: 5 }],
  price: { min: '100.00', max: '900.00' },
  ratings: [
    { minRating: 4, count: 2 },
    { minRating: 3, count: 4 },
  ],
};

describe('buildFacetHref', () => {
  it('serializes current.q as search= (not q=) to round-trip with the page parser', () => {
    const href = buildFacetHref({ q: 'phone' }, 'brand', 'Acme');
    expect(href).toContain('search=phone');
    expect(href).not.toContain('q=phone');
    expect(href).toContain('brand=Acme');
  });
});

describe('CatalogFilters facets', () => {
  it('renders brand buckets with counts as links when facets are passed', () => {
    render(<CatalogFilters categories={[]} current={{ q: 'phone' }} facets={facets} />);
    const acme = screen.getByRole('link', { name: /Acme/ });
    expect(acme).toHaveTextContent('3');
    expect(acme.getAttribute('href')).toContain('brand=Acme');
    expect(acme.getAttribute('href')).toContain('search=phone');
  });

  it('renders rating "& up" buckets with counts', () => {
    render(<CatalogFilters categories={[]} current={{ q: 'phone' }} facets={facets} />);
    const r4 = screen.getByRole('link', { name: /4.*up/i });
    expect(r4.getAttribute('href')).toContain('minRating=4');
  });

  it('shows a remove link for the active brand facet', () => {
    render(<CatalogFilters categories={[]} current={{ q: 'phone', brand: 'Acme' }} facets={facets} />);
    const remove = screen.getByRole('link', { name: /remove .*Acme/i });
    const href = remove.getAttribute('href') ?? '';
    expect(href).not.toContain('brand=Acme');
    // …but it must preserve the active query (not collapse to a blank /products).
    expect(href).toContain('search=phone');
  });

  it('hides the sort control in search mode (facets present)', () => {
    render(<CatalogFilters categories={[]} current={{ q: 'phone' }} facets={facets} />);
    expect(screen.queryByLabelText('Sort')).toBeNull();
  });

  it('renders unchanged (with Sort) when no facets are passed', () => {
    render(<CatalogFilters categories={[]} current={{}} />);
    expect(screen.getByLabelText('Sort')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Acme/ })).toBeNull();
  });
});
