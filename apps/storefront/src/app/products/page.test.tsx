import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paginated, SearchResult } from '@/lib/catalog';
import type { Product } from '@/lib/catalog';

// Mock @/lib/catalog before importing the page (vi.mock is hoisted by Vitest).
const mockGetProducts = vi.fn<[], Promise<Paginated<Product>>>();
const mockGetSearchResults = vi.fn<[], Promise<SearchResult>>();
const mockGetCategoryTree = vi.fn();

vi.mock('@/lib/catalog', () => ({
  getProducts: (...args: unknown[]) => mockGetProducts(...(args as [])),
  getSearchResults: (...args: unknown[]) => mockGetSearchResults(...(args as [])),
  getCategoryTree: (...args: unknown[]) => mockGetCategoryTree(...(args as [])),
}));

// Import the page AFTER the mock is established.
import ProductsPage from './page';

const emptyPage: Paginated<Product> = {
  data: [],
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 1,
};

const emptySearchResult: SearchResult = {
  ...emptyPage,
  facets: { brands: [], categories: [], price: null, ratings: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default stubs so tests that don't care about a specific mock still run.
  mockGetProducts.mockResolvedValue(emptyPage);
  mockGetSearchResults.mockResolvedValue(emptySearchResult);
  mockGetCategoryTree.mockResolvedValue([]);
});

describe('ProductsPage', () => {
  it('uses browse mode (getProducts, no facets) when there is no query or filter', async () => {
    mockGetProducts.mockResolvedValue(emptyPage);
    const ui = await ProductsPage({ searchParams: Promise.resolve({}) });
    render(ui);
    expect(mockGetProducts).toHaveBeenCalled();
    expect(mockGetSearchResults).not.toHaveBeenCalled();
    // Sort select is visible in browse mode
    expect(screen.getByLabelText('Sort')).toBeInTheDocument();
  });

  it('uses search mode (facets + getSearchResults) when q is present', async () => {
    mockGetSearchResults.mockResolvedValue({
      data: [],
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 1,
      facets: { brands: [{ value: 'Acme', count: 2 }], categories: [], price: null, ratings: [] },
    });
    const ui = await ProductsPage({ searchParams: Promise.resolve({ search: 'phone' }) });
    render(ui);
    expect(mockGetSearchResults).toHaveBeenCalled();
    expect(mockGetProducts).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Acme/ })).toBeInTheDocument(); // facet sidebar shown
  });

  it('uses search mode when only a facet filter (brand) is present', async () => {
    mockGetSearchResults.mockResolvedValue(emptySearchResult);
    await ProductsPage({ searchParams: Promise.resolve({ brand: 'Acme' }) });
    expect(mockGetSearchResults).toHaveBeenCalledWith(
      expect.objectContaining({ brand: 'Acme', page: 1, pageSize: 12 }),
    );
  });
});
