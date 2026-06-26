import type { Metadata } from 'next';
import {
  getCategoryTree,
  getProducts,
  getSearchResults,
  type ListProductsQuery,
  type Product,
  type ProductSortBy,
  type SearchFacets,
  type SearchQuery,
  type SortDir,
} from '@/lib/catalog';
import { ProductCard } from '@/components/catalog/ProductCard';
import { Pagination } from '@/components/catalog/Pagination';
import {
  CatalogFilters,
  type CatalogFilterValues,
} from '@/components/catalog/CatalogFilters';

export const metadata: Metadata = {
  title: 'Shop all products',
  description: 'Browse our full catalog of products.',
};

const PAGE_SIZE = 12;

type RawParams = {
  page?: string | string[];
  search?: string | string[];
  category?: string | string[];
  minPrice?: string | string[];
  maxPrice?: string | string[];
  sort?: string | string[];
  brand?: string | string[];
  minRating?: string | string[];
};

function first(raw: string | string[] | undefined): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && v.length > 0 ? v : undefined;
}

function parsePage(raw: string | string[] | undefined): number {
  const n = Number(first(raw));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Coerce a raw price param to a positive number, else undefined. */
function parsePrice(raw: string | string[] | undefined): number | undefined {
  const v = first(raw);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Coerce a raw rating param to an integer 1..5, else undefined. */
function parseRating(raw: string | string[] | undefined): number | undefined {
  const v = first(raw);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
}

const SORT_COLUMNS: ProductSortBy[] = ['createdAt', 'price', 'name'];

/** Split a "column:dir" sort param into validated sortBy/sortDir. */
function parseSort(raw: string | string[] | undefined): {
  sortBy?: ProductSortBy;
  sortDir?: SortDir;
} {
  const [col, dir] = (first(raw) ?? '').split(':');
  if (!SORT_COLUMNS.includes(col as ProductSortBy)) return {};
  return {
    sortBy: col as ProductSortBy,
    sortDir: dir === 'asc' ? 'asc' : 'desc',
  };
}

/** Serialize active filters into a query string (for pagination links). */
function filterQueryString(values: CatalogFilterValues, page: number): string {
  const params = new URLSearchParams();
  if (values.q) params.set('search', values.q);
  else if (values.search) params.set('search', values.search);
  if (values.categoryId) params.set('category', values.categoryId);
  if (values.minPrice !== undefined) params.set('minPrice', String(values.minPrice));
  if (values.maxPrice !== undefined) params.set('maxPrice', String(values.maxPrice));
  if (values.brand) params.set('brand', values.brand);
  if (values.minRating !== undefined) params.set('minRating', String(values.minRating));
  if (!values.brand && !values.minRating && !values.q && !values.categoryId && values.sortBy && values.sortDir) {
    params.set('sort', `${values.sortBy}:${values.sortDir}`);
  }
  params.set('page', String(page));
  return `?${params.toString()}`;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const raw = await searchParams;
  const page = parsePage(raw.page);

  const q = first(raw.search);
  const categoryId = first(raw.category);
  const minPrice = parsePrice(raw.minPrice);
  const maxPrice = parsePrice(raw.maxPrice);
  const brand = first(raw.brand);
  const minRating = parseRating(raw.minRating);
  const { sortBy, sortDir } = parseSort(raw.sort);

  const searchMode = Boolean(
    q || categoryId || minPrice !== undefined || maxPrice !== undefined || brand || minRating !== undefined,
  );

  const categoriesPromise = getCategoryTree();

  let data: Product[];
  let total: number;
  let totalPages: number;
  let facets: SearchFacets | undefined;

  if (searchMode) {
    const query: SearchQuery = { q, page, pageSize: PAGE_SIZE, categoryId, minPrice, maxPrice, brand, minRating };
    const result = await getSearchResults(query);
    ({ data, total, totalPages, facets } = result);
  } else {
    const browseQuery: ListProductsQuery = { search: q, categoryId, minPrice, maxPrice, sortBy, sortDir, page, pageSize: PAGE_SIZE };
    const result = await getProducts(browseQuery);
    ({ data, total, totalPages } = result);
  }
  const categories = await categoriesPromise;

  const values: CatalogFilterValues = { search: q, q, categoryId, minPrice, maxPrice, brand, minRating, sortBy, sortDir };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-content">Shop</h1>
        <p className="text-sm text-content-muted">
          {total} {total === 1 ? 'product' : 'products'}
        </p>
      </header>

      <CatalogFilters categories={categories} current={values} facets={facets} />

      {data.length === 0 ? (
        <p className="text-content-muted">No products match your filters.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((product) => (
            <li key={product.id} className="flex">
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        hrefForPage={(p) => `/products${filterQueryString(values, p)}`}
      />
    </main>
  );
}
