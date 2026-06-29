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
import { StickyAside } from '@/components/catalog/StickyAside';

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
function filterQueryString(values: CatalogFilterValues, page: number, searchMode: boolean): string {
  const params = new URLSearchParams();
  if (values.q) params.set('search', values.q);
  if (values.categoryId) params.set('category', values.categoryId);
  if (values.minPrice !== undefined) params.set('minPrice', String(values.minPrice));
  if (values.maxPrice !== undefined) params.set('maxPrice', String(values.maxPrice));
  if (values.brand) params.set('brand', values.brand);
  if (values.minRating !== undefined) params.set('minRating', String(values.minRating));
  if (!searchMode && values.sortBy && values.sortDir) {
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
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 pb-24 pt-12">
      <header className="flex flex-col gap-3 border-b border-line pb-8">
        <span className="text-xs font-medium uppercase tracking-[0.28em] text-content-subtle">
          The catalog
        </span>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-heading text-4xl font-medium tracking-[-0.01em] text-content sm:text-5xl">
            {searchMode && q ? `Results for “${q}”` : 'Shop all'}
          </h1>
          <p className="text-sm tabular-nums text-content-muted">
            {total} {total === 1 ? 'product' : 'products'}
          </p>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[260px_1fr] lg:gap-12">
        <StickyAside>
          <h2 className="mb-6 font-heading text-lg font-medium text-content">
            Refine
          </h2>
          <CatalogFilters
            categories={categories}
            current={values}
            facets={facets}
          />
        </StickyAside>

        <div className="flex flex-col gap-10">
          {data.length === 0 ? (
            <div className="flex flex-col items-center gap-3 border border-line bg-surface py-20 text-center">
              <p className="font-heading text-2xl font-medium text-content">
                Nothing matches those filters.
              </p>
              <p className="text-sm text-content-muted">
                Try widening your search or clearing a filter.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-3">
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
            hrefForPage={(p) =>
              `/products${filterQueryString(values, p, searchMode)}`
            }
          />
        </div>
      </div>
    </main>
  );
}
