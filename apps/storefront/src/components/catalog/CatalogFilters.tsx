import Link from 'next/link';
import type { Category, ProductSortBy, SortDir, SearchFacets } from '@/lib/catalog';

/** Current filter values used to preselect the controls. */
export interface CatalogFilterValues {
  search?: string;
  q?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  minRating?: number;
  sortBy?: ProductSortBy;
  sortDir?: SortDir;
}

interface CatalogFiltersProps {
  categories: Category[];
  current?: CatalogFilterValues;
  facets?: SearchFacets;
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

/** Build a /products URL with one facet set or cleared, preserving other
 *  params and resetting page. `value === null` removes the facet. */
export function buildFacetHref(
  current: CatalogFilterValues,
  key: 'brand' | 'minRating',
  value: string | number | null,
): string {
  const params = new URLSearchParams();
  if (current.q) params.set('search', current.q);
  if (current.categoryId) params.set('category', current.categoryId);
  if (current.minPrice !== undefined) params.set('minPrice', String(current.minPrice));
  if (current.maxPrice !== undefined) params.set('maxPrice', String(current.maxPrice));
  // carry the OTHER facet (the one not being changed)
  if (key !== 'brand' && current.brand) params.set('brand', current.brand);
  if (key !== 'minRating' && current.minRating !== undefined) {
    params.set('minRating', String(current.minRating));
  }
  if (value !== null) params.set(key === 'brand' ? 'brand' : 'minRating', String(value));
  return `/products?${params.toString()}`;
}

/**
 * URL-driven catalog filters. A plain GET form that navigates to
 * /products?search=&category=&sort=… so every filtered view is a real,
 * shareable, server-rendered URL — no client-side data fetching. The page
 * parses these params and passes them to the API.
 *
 * When `facets` is provided (search mode), renders brand + rating facet
 * buckets as navigating links and hides the sort control.
 */
export function CatalogFilters({ categories, current, facets }: CatalogFiltersProps) {
  const options = flattenCategories(categories);
  const currentSort =
    current?.sortBy && current?.sortDir
      ? `${current.sortBy}:${current.sortDir}`
      : 'createdAt:desc';

  const labelClass =
    'text-xs font-medium uppercase tracking-[0.18em] text-content-subtle';
  const fieldClass =
    'w-full border border-line bg-surface px-3.5 py-2.5 text-sm text-content transition-colors focus:border-content focus:outline-none focus:ring-1 focus:ring-content';
  const selectClass = `${fieldClass} cursor-pointer appearance-none bg-[image:var(--chevron)] bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9`;

  return (
    <>
      <form
        method="get"
        action="/products"
        className="flex flex-col gap-7"
        // Inline chevron data-URI (currentColor) for the custom select arrow.
        style={{
          ['--chevron' as string]:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2357534e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="filter-search" className={labelClass}>
            Search
          </label>
          <input
            id="filter-search"
            type="search"
            name="search"
            defaultValue={current?.q ?? current?.search ?? ''}
            placeholder="Search products"
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="filter-category" className={labelClass}>
            Category
          </label>
          <select
            id="filter-category"
            name="category"
            defaultValue={current?.categoryId ?? ''}
            className={selectClass}
          >
            <option value="">All categories</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-2">
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
              className={fieldClass}
            />
            <span aria-hidden="true" className="text-content-subtle">
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
              className={fieldClass}
            />
          </div>
        </fieldset>

        {!facets && (
          <div className="flex flex-col gap-2">
            <label htmlFor="filter-sort" className={labelClass}>
              Sort
            </label>
            <select
              id="filter-sort"
              name="sort"
              defaultValue={currentSort}
              className={selectClass}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-line pt-6">
          <button
            type="submit"
            className="w-full bg-content py-3 text-xs font-medium uppercase tracking-[0.14em] text-surface transition-colors duration-300 hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            Apply filters
          </button>
          <Link
            href="/products"
            className="text-center text-xs font-medium uppercase tracking-[0.12em] text-content-muted transition-colors duration-300 hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            Clear all
          </Link>
        </div>
      </form>

      {facets && (
        <div className="flex flex-col gap-6 border-t border-line pt-7">
          {facets.brands.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className={labelClass}>Brand</legend>
              <ul className="flex flex-col gap-1">
                {facets.brands.map((b) => {
                  const active = current?.brand === b.value;
                  return (
                    <li key={b.value} className="flex items-center justify-between gap-2 text-sm">
                      <Link
                        href={buildFacetHref(current ?? {}, 'brand', active ? null : b.value)}
                        aria-current={active || undefined}
                        className={`hover:underline ${active ? "font-medium text-content underline underline-offset-4" : "text-content-muted"}`}
                      >
                        {b.value} ({b.count})
                      </Link>
                      {active && (
                        <Link
                          href={buildFacetHref(current ?? {}, 'brand', null)}
                          aria-label={`Remove ${b.value} brand filter`}
                          className="text-content-subtle hover:text-content"
                        >
                          ×
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
          {facets.ratings.some((r) => r.count > 0) && (
            <fieldset className="flex flex-col gap-2">
              <legend className={labelClass}>Rating</legend>
              <ul className="flex flex-col gap-1">
                {facets.ratings.map((r) => {
                  const active = current?.minRating === r.minRating;
                  return (
                    <li key={r.minRating} className="flex items-center justify-between gap-2 text-sm">
                      <Link
                        href={buildFacetHref(current ?? {}, 'minRating', active ? null : r.minRating)}
                        aria-current={active || undefined}
                        className={`hover:underline ${active ? "font-medium text-content underline underline-offset-4" : "text-content-muted"}`}
                      >
                        {r.minRating} ★ &amp; up ({r.count})
                      </Link>
                      {active && (
                        <Link
                          href={buildFacetHref(current ?? {}, 'minRating', null)}
                          aria-label={`Remove ${r.minRating} star and up rating filter`}
                          className="text-content-subtle hover:text-content"
                        >
                          ×
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
        </div>
      )}
    </>
  );
}
