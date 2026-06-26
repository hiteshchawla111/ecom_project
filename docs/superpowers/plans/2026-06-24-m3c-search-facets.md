# M3c Search — Slice 3: Faceted Filters API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add faceted filtering to `GET /products/search` — accept brand/category/price/rating filters that narrow ranked results, and return an always-present `facets` block with disjunctive counts.

**Architecture:** Extend the existing `ProductSearch` seam (no new module, no migration). A pure `buildSearchWhere(...)` helper produces composable parameterized `Prisma.Sql` WHERE fragments (the disjunctive "omit one facet" core). `PostgresProductSearch.search()` applies all filters to the ranked results query and runs four facet-count queries (each omitting its own filter) via `Promise.all`.

**Tech Stack:** NestJS 11, TypeScript (strict), Prisma 7 (`@prisma/adapter-pg`; `Prisma.sql`/`Prisma.join`/`Prisma.empty` for composable parameterized raw SQL), PostgreSQL (GIN FTS + GROUP BY aggregations), Jest (unit + e2e via `test/jest-e2e.json` + supertest), class-validator/class-transformer, `curl` smoke.

## Global Constraints

- Strict TypeScript; **no `any`** (test mocks may use `as never`).
- Raw SQL via `prisma.$queryRaw` with `Prisma.sql` composition — every filter value is a bound param via `${value}` interpolation inside a `Prisma.sql` fragment (NEVER string-concatenated; NEVER `$queryRawUnsafe` for user values). `Prisma.empty` for an absent fragment. The repo already uses this pattern at `inventory.service.ts:466`.
- The text-match `@@` expression stays exactly `to_tsvector('english', p.name || ' ' || coalesce(p.description, ''))` (matches the K2 GIN index) and uses `websearch_to_tsquery('english', q)` — unchanged from slice 1.
- Search is `@Public`, ACTIVE-only (`p."deletedAt" IS NULL AND p.status = 'ACTIVE'`), all sellers.
- **Disjunctive counts:** each facet's count query applies the base predicate + ALL filters EXCEPT that facet's own filter.
- Facet shapes: brands `{value,count}[]` (brand IS NOT NULL, desc by count); categories `{categoryId,name,count}[]` (join `Category.name`); price `{min,max}|null` (regular `price`, strings); ratings `{minRating,count}[]` for thresholds 4,3,2,1 (`ratingAvg >= t`).
- `facets` is ALWAYS present in the response (empty `[]` / `price:null` when no matches).
- **Blank-`q` rule:** blank/whitespace `q` AND no filters → empty page + empty facets (no DB). Blank `q` WITH ≥1 filter → run (browse mode, no text predicate).
- Filter param bounds (mirror catalog `ListProductsDto`): `brand`/`categoryId` string MaxLength 120; `minPrice`/`maxPrice` `@IsPositive`; `minRating` `@Min(1) @Max(5)`.
- `price`/`salePrice`/price min-max come back as **strings** (Postgres numeric via `@prisma/adapter-pg`). Counts come back as **bigint** from `count(*)` → convert with `Number(...)`.
- DB is `ecom_dev` (shadow `ecom_shadow`), user `sotsys033`, no password. Never touch `ecomm`. Use `prisma migrate deploy` (NOT `migrate dev`) against the shared DB.
- Verify with `npx tsc --noEmit` (build hides tsc errors) AND a real boot+HTTP smoke. 3 pre-existing tsc errors in unrelated specs (`low-stock.listener.spec` ×2, `seller-mask.spec` ×1) are known — ignore; confirm zero NEW. Run `npx eslint <files> --fix` before each commit (prettier import-wrap bites otherwise).
- No `git push` without explicit user permission. Commit locally per task. Run from the worktree root `/Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/.claude/worktrees/feat-search-v2-slice3`; never cd to the original repo.

---

### Task 1: `SearchFilters` type + `buildSearchWhere` (pure, the disjunctive core)

**Files:**
- Create: `apps/api/src/search/search-filters.ts`
- Test: `apps/api/src/search/search-filters.spec.ts`

**Interfaces:**
- Produces:
  - `interface SearchFilters { brand?: string; categoryId?: string; minPrice?: number; maxPrice?: number; minRating?: number }`
  - `type FacetKey = 'brand' | 'category' | 'price' | 'rating'`
  - `function buildSearchWhere(q: string, filters: SearchFilters, omit?: FacetKey): Prisma.Sql` — returns a composable WHERE fragment **including the leading `WHERE`**, combining: base (`deletedAt IS NULL AND status='ACTIVE'`), the text predicate (only when `q.trim() !== ''`), and every filter clause EXCEPT the one named by `omit`. price filter = `omit==='price'` drops BOTH min and max; rating filter keyed by `'rating'`; brand by `'brand'`; category by `'category'`.

> **Note on testing a `Prisma.Sql`:** `Prisma.sql` produces an object with `.strings` (SQL literal chunks) and `.values` (bound params). Assert against those — e.g. the assembled SQL text contains/omits a clause, and `.values` carries the expected bound params in order. Do NOT assert on a fully-interpolated string (params are placeholders, not inlined).

- [ ] **Step 1: Write the failing test**

```typescript
import { Prisma } from '@prisma/client';
import { buildSearchWhere, SearchFilters } from './search-filters';

// Join the SQL literal chunks to inspect which clauses are present (params are $N placeholders).
const sqlText = (frag: Prisma.Sql): string => frag.strings.join('?');

describe('buildSearchWhere', () => {
  it('base only: active + not-deleted, no text predicate for blank q, no filters', () => {
    const f = buildSearchWhere('   ', {});
    const t = sqlText(f);
    expect(t).toContain('"deletedAt" IS NULL');
    expect(t).toContain("status = 'ACTIVE'");
    expect(t).not.toContain('to_tsquery');
    expect(f.values).toEqual([]);
  });

  it('adds the text predicate when q is non-blank (q is a bound param)', () => {
    const f = buildSearchWhere('phone', {});
    expect(sqlText(f)).toContain('websearch_to_tsquery');
    expect(f.values).toContain('phone');
  });

  it('applies all filters when omit is undefined (each value bound)', () => {
    const filters: SearchFilters = { brand: 'Acme', categoryId: 'cat1', minPrice: 100, maxPrice: 500, minRating: 4 };
    const f = buildSearchWhere('', filters);
    const t = sqlText(f);
    expect(t).toContain('p.brand =');
    expect(t).toContain('p."categoryId" =');
    expect(t).toContain('p.price >=');
    expect(t).toContain('p.price <=');
    expect(t).toContain('p."ratingAvg" >=');
    expect(f.values).toEqual(expect.arrayContaining(['Acme', 'cat1', 100, 500, 4]));
  });

  it("omit='brand' drops the brand clause but keeps category/price/rating", () => {
    const filters: SearchFilters = { brand: 'Acme', categoryId: 'cat1', minPrice: 100, minRating: 4 };
    const t = sqlText(buildSearchWhere('', filters, 'brand'));
    expect(t).not.toContain('p.brand =');
    expect(t).toContain('p."categoryId" =');
    expect(t).toContain('p.price >=');
    expect(t).toContain('p."ratingAvg" >=');
  });

  it("omit='price' drops BOTH min and max price clauses", () => {
    const filters: SearchFilters = { brand: 'Acme', minPrice: 100, maxPrice: 500 };
    const t = sqlText(buildSearchWhere('', filters, 'price'));
    expect(t).not.toContain('p.price >=');
    expect(t).not.toContain('p.price <=');
    expect(t).toContain('p.brand =');
  });

  it("omit='category' drops category; omit='rating' drops rating", () => {
    const filters: SearchFilters = { categoryId: 'cat1', minRating: 4 };
    expect(sqlText(buildSearchWhere('', filters, 'category'))).not.toContain('p."categoryId" =');
    expect(sqlText(buildSearchWhere('', filters, 'rating'))).not.toContain('p."ratingAvg" >=');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/search/search-filters.spec.ts`
Expected: FAIL — cannot find module `./search-filters`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Prisma } from '@prisma/client';

/** Single-value facet filters applied to a product search. */
export interface SearchFilters {
  brand?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
}

/** Which facet a count query is computing — used to omit that facet's own filter (disjunctive). */
export type FacetKey = 'brand' | 'category' | 'price' | 'rating';

/**
 * Build the parameterized WHERE fragment (incl. the leading `WHERE`) shared by the
 * results query and the facet-count queries. Every value is a bound param via
 * `Prisma.sql` interpolation (no injection). `omit` drops one facet's own filter so
 * that facet's counts stay disjunctive (show alternatives). Blank `q` adds no text
 * predicate (browse mode). The `@@` expression matches the K2 GIN index.
 */
export function buildSearchWhere(
  q: string,
  filters: SearchFilters,
  omit?: FacetKey,
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`p."deletedAt" IS NULL`,
    Prisma.sql`p.status = 'ACTIVE'`,
  ];

  const term = q.trim();
  if (term !== '') {
    clauses.push(
      Prisma.sql`to_tsvector('english', p.name || ' ' || coalesce(p.description, '')) @@ websearch_to_tsquery('english', ${term})`,
    );
  }

  if (omit !== 'brand' && filters.brand !== undefined) {
    clauses.push(Prisma.sql`p.brand = ${filters.brand}`);
  }
  if (omit !== 'category' && filters.categoryId !== undefined) {
    clauses.push(Prisma.sql`p."categoryId" = ${filters.categoryId}`);
  }
  if (omit !== 'price' && filters.minPrice !== undefined) {
    clauses.push(Prisma.sql`p.price >= ${filters.minPrice}`);
  }
  if (omit !== 'price' && filters.maxPrice !== undefined) {
    clauses.push(Prisma.sql`p.price <= ${filters.maxPrice}`);
  }
  if (omit !== 'rating' && filters.minRating !== undefined) {
    clauses.push(Prisma.sql`p."ratingAvg" >= ${filters.minRating}`);
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/search/search-filters.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/api && npx eslint src/search/search-filters.ts src/search/search-filters.spec.ts --fix
cd .. && git add apps/api/src/search/search-filters.ts apps/api/src/search/search-filters.spec.ts
git commit -m "feat(m3c): SearchFilters + buildSearchWhere (disjunctive WHERE builder)"
```

---

### Task 2: Extend `SearchProductsDto` with facet filter params

**Files:**
- Modify: `apps/api/src/search/dto/search-products.dto.ts`
- Test: `apps/api/src/search/dto/search-products.dto.spec.ts` (extend existing)

**Interfaces:**
- Produces: `SearchProductsDto` gains `brand?: string`, `categoryId?: string`, `minPrice?: number`, `maxPrice?: number`, `minRating?: number`.

- [ ] **Step 1: Write the failing tests (append to the existing describe block)**

Append inside `describe('SearchProductsDto', …)` in `apps/api/src/search/dto/search-products.dto.spec.ts`:
```typescript
  it('accepts facet filters and coerces numerics', async () => {
    const dto = make({ q: 'x', brand: 'Acme', categoryId: 'cat1', minPrice: '100', maxPrice: '500', minRating: '4' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.minPrice).toBe(100);
    expect(dto.maxPrice).toBe(500);
    expect(dto.minRating).toBe(4);
  });

  it('rejects minRating above 5', async () => {
    const errors = await validate(make({ minRating: '6' }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-positive minPrice', async () => {
    const errors = await validate(make({ minPrice: '0' }));
    expect(errors.length).toBeGreaterThan(0);
  });
```
(The existing `make()` helper uses `plainToInstance`; reuse it.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/search/dto/search-products.dto.spec.ts`
Expected: FAIL — `minRating`/`brand` etc. not present, validation passes when it shouldn't.

- [ ] **Step 3: Add the fields**

In `apps/api/src/search/dto/search-products.dto.ts`, add `IsPositive` and `IsInt`/`Min`/`Max` as needed to the `class-validator` import, and add these fields to `SearchProductsDto` (after `pageSize`):
```typescript
  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(5)
  minRating?: number;
```
Ensure the import line includes `IsPositive` (add it): `import { IsInt, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';`

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest src/search/dto/search-products.dto.spec.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/api && npx eslint src/search/dto/search-products.dto.ts src/search/dto/search-products.dto.spec.ts --fix
cd .. && git add apps/api/src/search/dto/search-products.dto.ts apps/api/src/search/dto/search-products.dto.spec.ts
git commit -m "feat(m3c): SearchProductsDto facet filter params"
```

---

### Task 3: Add `SearchFilters` + `SearchFacets` to the seam; extend `search()` signature + result

**Files:**
- Modify: `apps/api/src/search/product-search.ts`

**Interfaces:**
- Consumes: `SearchFilters` from `./search-filters` (Task 1).
- Produces:
  - `interface SearchFacets { brands: {value:string;count:number}[]; categories: {categoryId:string;name:string;count:number}[]; price: {min:string;max:string}|null; ratings: {minRating:number;count:number}[] }`
  - `ProductSearchResult` gains `facets: SearchFacets`.
  - `ProductSearch.search` signature becomes `search(q, page, pageSize, filters?: SearchFilters): Promise<ProductSearchResult>`.

> No standalone commit: changing the interface signature + result type without updating the impl breaks tsc. This task's edit lands in the SAME commit as Task 4. (Specified separately so the implementer knows the exact seam shape to add.)

- [ ] **Step 1: Edit the seam**

In `apps/api/src/search/product-search.ts`:
1. Add the import: `import { SearchFilters } from './search-filters';`
2. Add the `SearchFacets` interface above `ProductSearchResult`:
```typescript
/** Facet buckets returned alongside search results (disjunctive counts). */
export interface SearchFacets {
  brands: { value: string; count: number }[];
  categories: { categoryId: string; name: string; count: number }[];
  price: { min: string; max: string } | null;
  ratings: { minRating: number; count: number }[];
}
```
3. Add `facets: SearchFacets;` to `ProductSearchResult` (after `totalPages`).
4. Change the interface method to:
```typescript
  search(
    q: string,
    page: number,
    pageSize: number,
    filters?: SearchFilters,
  ): Promise<ProductSearchResult>;
```

- [ ] **Step 2: Type-check (impl error expected until Task 4)**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep "postgres-product-search" || echo "no impl error yet"`
Expected: an error that `PostgresProductSearch.search` no longer matches / `facets` missing — EXPECTED. Do NOT commit alone; proceed to Task 4 (single combined commit).

---

### Task 4: Implement filters + disjunctive facet counts in `PostgresProductSearch.search()`

**Files:**
- Modify: `apps/api/src/search/postgres-product-search.ts`
- Test: `apps/api/src/search/postgres-product-search.spec.ts` (extend existing)

**Interfaces:**
- Consumes: `buildSearchWhere`/`SearchFilters`/`FacetKey` (Task 1); `SearchFacets` (Task 3); `PrismaService.$queryRaw`; `PRODUCT_SEARCH_INCLUDE`.
- Produces: `PostgresProductSearch.search(q, page, pageSize, filters = {})` applying filters + disjunctive facet counts.

> **Unit scope:** mocked `$queryRaw` cannot prove SQL counts. The unit tests assert the ORCHESTRATION: blank-q-no-filters short-circuits with no DB call; with input, the results query + 4 facet queries are issued; facets are assembled and always present; counts (bigint) → Number; empty results → empty buckets/`price:null`. Real counts + disjunctive correctness are proven by Task 5's e2e + smoke. The `$queryRaw` mock returns queued results per call (`mockResolvedValueOnce` chain) in the order the impl issues them — so the impl MUST issue queries in a fixed, documented order: [results, brands, categories, price, ratings].

- [ ] **Step 1: Write the failing tests (append a `describe('search with facets', …)`)**

Append to `apps/api/src/search/postgres-product-search.spec.ts`:
```typescript
  describe('search with facets', () => {
    // Mock issues results-rows first, then brand/category/price/rating facet rows in that order.
    const buildFaceted = (opts: {
      resultRows?: Array<{ id: string; rank: number; total: bigint }>;
      products?: Array<{ id: string }>;
      brands?: Array<{ value: string; count: bigint }>;
      categories?: Array<{ categoryId: string; name: string; count: bigint }>;
      price?: Array<{ min: string | null; max: string | null }>;
      ratings?: Array<{ minRating: number; count: bigint }>;
    }) => {
      const $queryRaw = jest
        .fn()
        .mockResolvedValueOnce(opts.resultRows ?? [])
        .mockResolvedValueOnce(opts.brands ?? [])
        .mockResolvedValueOnce(opts.categories ?? [])
        .mockResolvedValueOnce(opts.price ?? [{ min: null, max: null }])
        .mockResolvedValueOnce(opts.ratings ?? []);
      const prisma = {
        $queryRaw,
        product: { findMany: jest.fn().mockResolvedValue(opts.products ?? []) },
      };
      return { svc: new PostgresProductSearch(prisma as never), prisma };
    };

    it('blank q + no filters → empty page + empty facets, no DB call', async () => {
      const { svc, prisma } = buildFaceted({});
      const res = await svc.search('   ', 1, 20, {});
      expect(res.data).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.facets).toEqual({ brands: [], categories: [], price: null, ratings: [] });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('blank q WITH a filter runs (browse mode) and returns facets', async () => {
      const { svc, prisma } = buildFaceted({
        resultRows: [{ id: 'a', rank: 0, total: 1n }],
        products: [{ id: 'a' }],
        brands: [{ value: 'Acme', count: 1n }],
      });
      const res = await svc.search('', 1, 20, { categoryId: 'cat1' });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(5); // results + 4 facets
      expect(res.facets.brands).toEqual([{ value: 'Acme', count: 1 }]);
    });

    it('assembles all facet buckets and converts bigint counts to Number', async () => {
      const { svc } = buildFaceted({
        resultRows: [{ id: 'a', rank: 0.5, total: 2n }],
        products: [{ id: 'a' }],
        brands: [{ value: 'Acme', count: 2n }, { value: 'Beta', count: 3n }],
        categories: [{ categoryId: 'c1', name: 'Phones', count: 5n }],
        price: [{ min: '100.00', max: '900.00' }],
        ratings: [{ minRating: 4, count: 1n }, { minRating: 3, count: 2n }],
      });
      const res = await svc.search('phone', 1, 20, {});
      expect(res.facets.brands).toEqual([{ value: 'Acme', count: 2 }, { value: 'Beta', count: 3 }]);
      expect(res.facets.categories).toEqual([{ categoryId: 'c1', name: 'Phones', count: 5 }]);
      expect(res.facets.price).toEqual({ min: '100.00', max: '900.00' });
      expect(res.facets.ratings).toEqual([{ minRating: 4, count: 1 }, { minRating: 3, count: 2 }]);
    });

    it('empty price aggregate (no rows match) → price: null', async () => {
      const { svc } = buildFaceted({
        resultRows: [{ id: 'a', rank: 0, total: 1n }],
        products: [{ id: 'a' }],
        price: [{ min: null, max: null }],
      });
      const res = await svc.search('phone', 1, 20, {});
      expect(res.facets.price).toBeNull();
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/search/postgres-product-search.spec.ts -t "search with facets"`
Expected: FAIL — `search` ignores `filters`/returns no `facets`.

- [ ] **Step 3: Implement filters + facets**

In `apps/api/src/search/postgres-product-search.ts`:
1. Update imports:
```typescript
import { Prisma } from '@prisma/client';
import { buildSearchWhere, SearchFilters } from './search-filters';
import {
  ProductSearch,
  ProductSearchItem,
  ProductSearchResult,
  ProductSuggestion,
  SearchFacets,
  PRODUCT_SEARCH_INCLUDE,
} from './product-search';
```
2. Add raw-row interfaces near the existing ones:
```typescript
interface BrandFacetRow { value: string; count: bigint }
interface CategoryFacetRow { categoryId: string; name: string; count: bigint }
interface PriceFacetRow { min: string | null; max: string | null }
interface RatingFacetRow { minRating: number; count: bigint }

const EMPTY_FACETS: SearchFacets = { brands: [], categories: [], price: null, ratings: [] };
const RATING_THRESHOLDS = [4, 3, 2, 1] as const;
```
3. Replace the `search` method with the filtered + faceted version:
```typescript
  async search(
    q: string,
    page: number,
    pageSize: number,
    filters: SearchFilters = {},
  ): Promise<ProductSearchResult> {
    const term = q.trim();
    const hasFilters =
      filters.brand !== undefined ||
      filters.categoryId !== undefined ||
      filters.minPrice !== undefined ||
      filters.maxPrice !== undefined ||
      filters.minRating !== undefined;

    // Blank q with no filters preserves slice-1 behavior: empty, no DB hit.
    if (term === '' && !hasFilters) {
      return { data: [], page, pageSize, total: 0, totalPages: 1, facets: EMPTY_FACETS };
    }

    const offset = (page - 1) * pageSize;
    const whereAll = buildSearchWhere(q, filters);

    // Results page: ranked, fully-filtered, with a window-function total.
    // Issued FIRST (the spec's mock depends on this order).
    const rows = await this.prisma.$queryRaw<RankedRow[]>(Prisma.sql`
      SELECT p.id,
             ts_rank(
               setweight(to_tsvector('english', p.name), 'A') ||
               setweight(to_tsvector('english', coalesce(p.description, '')), 'B'),
               websearch_to_tsquery('english', ${term})
             ) AS rank,
             count(*) OVER() AS total
      FROM "Product" p
      ${whereAll}
      ORDER BY rank DESC, p."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const total = rows.length === 0 ? 0 : Number(rows[0].total);

    // Disjunctive facet counts — each omits its own filter. Order: brand, category, price, rating.
    const [brandRows, categoryRows, priceRows, ratingRows] = await Promise.all([
      this.prisma.$queryRaw<BrandFacetRow[]>(Prisma.sql`
        SELECT p.brand AS value, count(*) AS count
        FROM "Product" p ${buildSearchWhere(q, filters, 'brand')} AND p.brand IS NOT NULL
        GROUP BY p.brand ORDER BY count DESC, p.brand ASC
      `),
      this.prisma.$queryRaw<CategoryFacetRow[]>(Prisma.sql`
        SELECT p."categoryId" AS "categoryId", c.name AS name, count(*) AS count
        FROM "Product" p JOIN "Category" c ON c.id = p."categoryId"
        ${buildSearchWhere(q, filters, 'category')}
        GROUP BY p."categoryId", c.name ORDER BY count DESC, c.name ASC
      `),
      this.prisma.$queryRaw<PriceFacetRow[]>(Prisma.sql`
        SELECT min(p.price)::text AS min, max(p.price)::text AS max
        FROM "Product" p ${buildSearchWhere(q, filters, 'price')}
      `),
      // Rating thresholds — see Step 3 note for the exact (UNION ALL) form to use.
      this.prisma.$queryRaw<RatingFacetRow[]>(RATING_FACET_SQL(q, filters)),
    ]);

    const facets: SearchFacets = {
      brands: brandRows.map((r) => ({ value: r.value, count: Number(r.count) })),
      categories: categoryRows.map((r) => ({
        categoryId: r.categoryId,
        name: r.name,
        count: Number(r.count),
      })),
      price:
        priceRows[0]?.min != null && priceRows[0]?.max != null
          ? { min: priceRows[0].min, max: priceRows[0].max }
          : null,
      ratings: ratingRows.map((r) => ({ minRating: r.minRating, count: Number(r.count) })),
    };

    if (rows.length === 0) {
      return { data: [], page, pageSize, total: 0, totalPages: 1, facets };
    }

    const ids = rows.map((r) => r.id);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: PRODUCT_SEARCH_INCLUDE,
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((p): p is ProductSearchItem => p !== undefined);

    return {
      data,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      facets,
    };
  }
```

4. Define `RATING_FACET_SQL` as a module-level function in this file (above the class), building one query whose threshold counts are all constrained by the disjunctive rating-omitted WHERE. NULL `ratingAvg` never satisfies `>=`, so unrated products are correctly excluded; rows come back ordered 4,3,2,1:
```typescript
const RATING_FACET_SQL = (q: string, filters: SearchFilters): Prisma.Sql => {
  const where = buildSearchWhere(q, filters, 'rating');
  return Prisma.sql`
    SELECT 4 AS "minRating", count(*) FILTER (WHERE p."ratingAvg" >= 4) AS count FROM "Product" p ${where}
    UNION ALL SELECT 3, count(*) FILTER (WHERE p."ratingAvg" >= 3) FROM "Product" p ${where}
    UNION ALL SELECT 2, count(*) FILTER (WHERE p."ratingAvg" >= 2) FROM "Product" p ${where}
    UNION ALL SELECT 1, count(*) FILTER (WHERE p."ratingAvg" >= 1) FROM "Product" p ${where}
  `;
};
```
(Reusing the same `where` fragment four times is safe — `Prisma.sql` re-emits its bound params for each interpolation.)

- [ ] **Step 4: Run the search suite + type-check**

Run: `cd apps/api && npx jest src/search/postgres-product-search.spec.ts && npx tsc --noEmit 2>&1 | grep "src/search/" || echo "no search tsc errors"`
Expected: all tests pass (slice-1/2 search + suggest + new facet tests); no tsc errors in `src/search/`.

- [ ] **Step 5: Lint + commit (this commit also carries Task 3's seam edit)**

```bash
cd apps/api && npx eslint src/search/ --fix
cd .. && git add apps/api/src/search/product-search.ts apps/api/src/search/postgres-product-search.ts apps/api/src/search/postgres-product-search.spec.ts
git commit -m "feat(m3c): faceted search — filters + disjunctive facet counts"
```

---

### Task 5: Wire filters in the controller; e2e (seeded) + HTTP smoke + full gate

**Files:**
- Modify: `apps/api/src/search/search.controller.ts`
- Modify: `apps/api/src/search/search.controller.spec.ts` (extend)
- Create: `apps/api/test/search-facets.e2e-spec.ts`
- Modify: `apps/api/scripts/smoke-search.sh`

**Interfaces:**
- Consumes: `SearchProductsDto` facet fields (Task 2); `search(q,page,pageSize,filters)` (Tasks 3/4).
- Produces: `GET /products/search` passes a `filters` object built from the DTO; e2e proving disjunctive counts.

- [ ] **Step 1: Write the failing controller test (extend the existing `search` describe)**

In `apps/api/src/search/search.controller.spec.ts`, the existing `search` test builds the controller with a stub exposing `search`. Add a test asserting filters are forwarded. Use the existing `{ searchFn, stub }` factory pattern; add:
```typescript
    it('forwards facet filters from the DTO to ProductSearch.search', async () => {
      const { searchFn, stub } = makeSearch();
      const ctrl = new SearchController(stub);
      await ctrl.search({ q: 'phone', page: 1, pageSize: 20, brand: 'Acme', categoryId: 'c1', minPrice: 100, maxPrice: 500, minRating: 4 });
      expect(searchFn).toHaveBeenCalledWith('phone', 1, 20, {
        brand: 'Acme', categoryId: 'c1', minPrice: 100, maxPrice: 500, minRating: 4,
      });
    });
```
(If the existing `makeSearch()` stub only defines `search`, that's fine — this test only calls `search`.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/search/search.controller.spec.ts -t "facet filters"`
Expected: FAIL — controller calls `search` with only 3 args.

- [ ] **Step 3: Update the controller handler**

In `apps/api/src/search/search.controller.ts`, change the `search` handler to build and forward `filters`:
```typescript
  @Public()
  @Get('search')
  search(@Query() query: SearchProductsDto) {
    return this.productSearch.search(query.q ?? '', query.page ?? 1, query.pageSize ?? 20, {
      brand: query.brand,
      categoryId: query.categoryId,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minRating: query.minRating,
    });
  }
```
(Undefined fields stay undefined — `buildSearchWhere` checks `!== undefined`.)

- [ ] **Step 4: Run controller test + verify it passes**

Run: `cd apps/api && npx jest src/search/search.controller.spec.ts`
Expected: PASS (existing search + suggest + new facet-forwarding test).

- [ ] **Step 5: Write the seeded-fixture e2e**

Create `apps/api/test/search-facets.e2e-spec.ts`. Mirror `test/public-sellers.e2e-spec.ts`'s boot + namespaced-seed + cleanup. Seed (via PrismaService) one seller + one category + products with known brands/prices/ratings under a unique namespace, then assert disjunctive facet behavior:
```typescript
/**
 * e2e: faceted search counts (disjunctive) against seeded fixtures.
 * Shared ecom_dev has all-NULL ratings + messy brands, so this seeds its own
 * deterministic data in a unique namespace and cleans up (FK order) after.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ProductStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const NS = 'e2e-facets';

describe('faceted search (disjunctive counts)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let categoryId: string;
  let sellerId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    // A dedicated seller + category for this namespace.
    const seller = await prisma.seller.findFirstOrThrow({ where: { products: { some: {} } } });
    sellerId = seller.id;
    const category = await prisma.category.create({ data: { name: `${NS}-cat`, slug: `${NS}-cat` } });
    categoryId = category.id;

    // 3 brands; all share the unique token NS so the text query isolates them.
    // Acme×2, Beta×1, Gamma×1 — distinct prices + ratings.
    const rows = [
      { sku: `${NS}-1`, name: `${NS} widget`, brand: 'AcmeFx', price: '100.00', ratingAvg: '4.5' },
      { sku: `${NS}-2`, name: `${NS} widget`, brand: 'AcmeFx', price: '200.00', ratingAvg: '3.5' },
      { sku: `${NS}-3`, name: `${NS} widget`, brand: 'BetaFx', price: '300.00', ratingAvg: '4.0' },
      { sku: `${NS}-4`, name: `${NS} widget`, brand: 'GammaFx', price: '400.00', ratingAvg: null },
    ];
    for (const r of rows) {
      await prisma.product.create({
        data: {
          sku: r.sku, name: r.name, description: 'facet fixture', price: r.price,
          ratingAvg: r.ratingAvg ?? undefined, status: ProductStatus.ACTIVE,
          categoryId, sellerId,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { sku: { startsWith: NS } } });
    await prisma.category.deleteMany({ where: { slug: `${NS}-cat` } });
    await app.close();
  });

  const search = (qs: string) =>
    request(app.getHttpServer()).get(`/products/search?q=${NS}+widget&${qs}`);

  it('brand facet lists all 3 brands with disjunctive counts when brand is filtered', async () => {
    // Filter brand=AcmeFx; brand facet should STILL show Beta/Gamma (disjunctive).
    const res = await search('brand=AcmeFx');
    expect(res.status).toBe(200);
    const brands = res.body.facets.brands as Array<{ value: string; count: number }>;
    const byBrand = Object.fromEntries(brands.map((b) => [b.value, b.count]));
    expect(byBrand.AcmeFx).toBe(2);
    expect(byBrand.BetaFx).toBe(1);
    expect(byBrand.GammaFx).toBe(1);
    // Results themselves are narrowed to AcmeFx.
    expect(res.body.total).toBe(2);
  });

  it('category facet count honors the active brand filter (disjunctive only drops own facet)', async () => {
    const res = await search('brand=AcmeFx');
    const cat = (res.body.facets.categories as Array<{ categoryId: string; count: number }>)
      .find((c) => c.categoryId === categoryId);
    expect(cat?.count).toBe(2); // only AcmeFx products in this category
  });

  it('price facet returns min/max over the (price-omitted) set', async () => {
    const res = await search('minPrice=150');
    // price facet omits its own filter → spans all 4 (100..400)
    expect(res.body.facets.price).toEqual({ min: '100.00', max: '400.00' });
    // results are narrowed to >=150 → 3 products
    expect(res.body.total).toBe(3);
  });

  it('rating facet threshold counts (unrated excluded)', async () => {
    const res = await search('');
    const r = Object.fromEntries(
      (res.body.facets.ratings as Array<{ minRating: number; count: number }>).map((x) => [x.minRating, x.count]),
    );
    expect(r[4]).toBe(2); // 4.5, 4.0
    expect(r[3]).toBe(3); // 4.5, 4.0, 3.5
    expect(r[1]).toBe(3); // GammaFx has NULL rating → excluded
  });
});
```

- [ ] **Step 6: Run the e2e**

Run: `cd apps/api && npx prisma migrate deploy && npm run test:e2e -- search-facets`
Expected: PASS (4 tests). If a count is off, inspect the disjunctive WHERE for that facet.

- [ ] **Step 7: Append facet checks to the smoke script**

Add to `apps/api/scripts/smoke-search.sh` just before `echo "ALL SMOKE CHECKS PASSED"`:
```bash
echo "== facets: search returns an always-present facets block =="
curl -s "$BASE/products/search?q=phone" | python3 -c '
import sys, json
r = json.load(sys.stdin)
f = r["facets"]
for k in ("brands", "categories", "price", "ratings"):
    assert k in f, f"missing facet {k}"
assert isinstance(f["brands"], list) and isinstance(f["ratings"], list)
print("facets keys OK; brands:", [b["value"] for b in f["brands"]])'

echo "== facets: a brand filter narrows total =="
curl -s "$BASE/products/search?q=phone" | python3 -c 'import sys,json; print("unfiltered total:", json.load(sys.stdin)["total"])'
curl -s --get "$BASE/products/search" --data-urlencode "q=phone" --data-urlencode "minRating=4" | python3 -c '
import sys, json
r = json.load(sys.stdin)
assert "facets" in r and "total" in r
print("minRating=4 total:", r["total"], "OK")'
```

- [ ] **Step 8: Full gate — unit suite, lint, tsc, boot + smoke**

```bash
cd apps/api
npx jest                                  # full unit suite green
npm run lint                              # clean
npx tsc --noEmit 2>&1 | grep -v -E "low-stock.listener.spec|seller-mask.spec" | grep "error TS" || echo "no NEW tsc errors"
lsof -ti:5000 | xargs kill -9 2>/dev/null  # clear stale server (memory)
npx prisma migrate deploy
npm run start:dev &                       # wait for "Mapped {/products/search" + "successfully started"
bash scripts/smoke-search.sh              # ALL SMOKE CHECKS PASSED (incl. facet checks)
lsof -ti:5000 | xargs kill -9 2>/dev/null  # stop server
```
Expected: full suite green; lint clean; no NEW tsc errors; smoke prints `ALL SMOKE CHECKS PASSED`.

- [ ] **Step 9: Commit**

```bash
cd apps/api && npx eslint src/search/ test/search-facets.e2e-spec.ts --fix
cd .. && git add apps/api/src/search/search.controller.ts apps/api/src/search/search.controller.spec.ts apps/api/test/search-facets.e2e-spec.ts apps/api/scripts/smoke-search.sh
git commit -m "feat(m3c): wire facet filters in controller + facets e2e/smoke"
```

---

### Task 6: Update the roadmap status

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md` (M3c note)

- [ ] **Step 1: Update the M3c marker + note**

In `docs/IMPLEMENTATION_PLAN.md`, change `M3c 🟡 (slices 1–2 done)` → `M3c 🟡 (slices 1–3 done)`, and append after the slice-2 sentence:
*"**Slice 3 (faceted filters) ✅** — `GET /products/search` accepts brand/categoryId/minPrice/maxPrice/minRating and returns an always-present `facets` block (brand & category value buckets, price min/max, rating thresholds) with **disjunctive** counts (each facet omits its own filter) via a pure `buildSearchWhere` `Prisma.sql` builder + parallel aggregations; blank-q+filters = browse mode. 412+ api tests + facets e2e (seeded, disjunctive counts asserted); HTTP-smoked vs `ecom_dev`. **Next M3c slice:** (4) storefront search/autocomplete/facet UI."*

- [ ] **Step 2: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m3c): mark search slice 3 (faceted filters) done"
```

---

## Self-Review

**Spec coverage:**
- Filters narrow results + facet counts returned → Tasks 2,3,4,5. ✅
- Disjunctive counts (omit own filter) → Task 1 `buildSearchWhere(omit)` + Task 4 per-facet calls. ✅
- Per-facet shapes (brand/category buckets, price min/max, rating thresholds) → Task 4 SQL + Task 3 types. ✅
- Single-value params, catalog-mirrored bounds → Task 2. ✅
- `search()` optional `filters` + always-present `facets` → Tasks 3,4. ✅
- Blank-q rule (no filters→empty; with filters→browse) → Task 4 short-circuit + tests. ✅
- WHERE-builder + parallel queries → Task 1 + Task 4 `Promise.all`. ✅
- Verify via e2e (seeded) + smoke → Task 5. ✅
- No injection (Prisma.sql params) / GIN index reused → Global Constraints + Task 1/4. ✅
- Acceptance (all green, disjunctive proven) → Task 5 gate. ✅

**Placeholder scan:** No TBD/TODO; every code step has full code. Task 3 has no standalone commit (interface+impl land together in Task 4) — stated explicitly, not a placeholder. The rating facet is a single `RATING_FACET_SQL` helper referenced once in the `Promise.all` — no ambiguity. ✅

**Type consistency:** `buildSearchWhere(q, filters, omit?): Prisma.Sql` consistent Task 1 ↔ Task 4. `SearchFilters` fields identical across Tasks 1/2/3/4/5. `SearchFacets` shape (`brands/categories/price/ratings`) consistent Task 3 ↔ Task 4 ↔ Task 5 assertions. `search(q,page,pageSize,filters?)` consistent Tasks 3/4/5. Counts `bigint`→`Number` consistent. ✅
