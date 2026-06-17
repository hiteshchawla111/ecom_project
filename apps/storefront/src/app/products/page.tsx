import type { Metadata } from 'next';
import {
  getCategoryTree,
  getProducts,
  type ListProductsQuery,
  type ProductSortBy,
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

/** Build the API/query model and the filter-bar values from raw params. */
function buildQuery(raw: RawParams): {
  query: ListProductsQuery;
  values: CatalogFilterValues;
} {
  const search = first(raw.search);
  const categoryId = first(raw.category);
  const minPrice = parsePrice(raw.minPrice);
  const maxPrice = parsePrice(raw.maxPrice);
  const { sortBy, sortDir } = parseSort(raw.sort);
  const values: CatalogFilterValues = {
    search,
    categoryId,
    minPrice,
    maxPrice,
    sortBy,
    sortDir,
  };
  return { query: { search, categoryId, minPrice, maxPrice, sortBy, sortDir }, values };
}

/** Serialize active filters into a query string (for pagination links). */
function filterQueryString(values: CatalogFilterValues, page: number): string {
  const params = new URLSearchParams();
  if (values.search) params.set('search', values.search);
  if (values.categoryId) params.set('category', values.categoryId);
  if (values.minPrice !== undefined) params.set('minPrice', String(values.minPrice));
  if (values.maxPrice !== undefined) params.set('maxPrice', String(values.maxPrice));
  if (values.sortBy && values.sortDir) {
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
  const { query, values } = buildQuery(raw);

  const [{ data, total, totalPages }, categories] = await Promise.all([
    getProducts({ ...query, page, pageSize: PAGE_SIZE }),
    getCategoryTree(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-900">Shop</h1>
        <p className="text-sm text-neutral-600">
          {total} {total === 1 ? 'product' : 'products'}
        </p>
      </header>

      <CatalogFilters categories={categories} current={values} />

      {data.length === 0 ? (
        <p className="text-neutral-600">No products match your filters.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((product) => (
            <li key={product.id}>
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
