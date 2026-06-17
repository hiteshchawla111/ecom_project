import Link from 'next/link';
import type { Category, ProductSortBy, SortDir } from '@/lib/catalog';

/** Current filter values used to preselect the controls. */
export interface CatalogFilterValues {
  search?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: ProductSortBy;
  sortDir?: SortDir;
}

interface CatalogFiltersProps {
  categories: Category[];
  current?: CatalogFilterValues;
}

interface SortOption {
  value: string;
  label: string;
}

/** Sort options encode column+direction in one value (parsed by the page). */
const SORT_OPTIONS: SortOption[] = [
  { value: 'createdAt:desc', label: 'Newest' },
  { value: 'price:asc', label: 'Price: low to high' },
  { value: 'price:desc', label: 'Price: high to low' },
  { value: 'name:asc', label: 'Name: A–Z' },
];

/** Flatten the category tree into options, indenting by depth for hierarchy. */
function flattenCategories(
  categories: Category[],
  depth = 0,
): Array<{ id: string; label: string }> {
  return categories.flatMap((c) => [
    { id: c.id, label: `${'— '.repeat(depth)}${c.name}` },
    ...flattenCategories(c.children ?? [], depth + 1),
  ]);
}

/**
 * URL-driven catalog filters. A plain GET form that navigates to
 * /products?search=&category=&sort=… so every filtered view is a real,
 * shareable, server-rendered URL — no client-side data fetching. The page
 * parses these params and passes them to the API.
 */
export function CatalogFilters({ categories, current }: CatalogFiltersProps) {
  const options = flattenCategories(categories);
  const currentSort =
    current?.sortBy && current?.sortDir
      ? `${current.sortBy}:${current.sortDir}`
      : 'createdAt:desc';

  const labelClass =
    'text-xs font-semibold uppercase tracking-wide text-neutral-500';
  const fieldClass =
    'rounded-md border border-neutral-200 bg-neutral-0 px-3 py-2 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <form
      method="get"
      action="/products"
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end"
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <label htmlFor="filter-search" className={labelClass}>
          Search
        </label>
        <input
          id="filter-search"
          type="search"
          name="search"
          defaultValue={current?.search ?? ''}
          placeholder="Search products"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="filter-category" className={labelClass}>
          Category
        </label>
        <select
          id="filter-category"
          name="category"
          defaultValue={current?.categoryId ?? ''}
          className={fieldClass}
        >
          <option value="">All categories</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className={labelClass}>Price range</legend>
        <div className="flex items-center gap-2">
          <input
            id="filter-min"
            type="number"
            name="minPrice"
            min={0}
            step="0.01"
            aria-label="Min price"
            placeholder="Min"
            defaultValue={current?.minPrice ?? ''}
            className={`w-24 ${fieldClass}`}
          />
          <span aria-hidden="true" className="text-neutral-400">
            –
          </span>
          <input
            id="filter-max"
            type="number"
            name="maxPrice"
            min={0}
            step="0.01"
            aria-label="Max price"
            placeholder="Max"
            defaultValue={current?.maxPrice ?? ''}
            className={`w-24 ${fieldClass}`}
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="filter-sort" className={labelClass}>
          Sort
        </label>
        <select
          id="filter-sort"
          name="sort"
          defaultValue={currentSort}
          className={fieldClass}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-neutral-0 transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          Apply
        </button>
        <Link
          href="/products"
          className="text-sm font-medium text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}
