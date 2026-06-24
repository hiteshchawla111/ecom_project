# M3c Search — Slice 2: Autocomplete + slice-1 follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public prefix-matched product autocomplete endpoint (`GET /products/suggest`) on the slice-1 search seam, and close the two slice-1 review follow-ups (share one `PRODUCT_INCLUDE`; add a route-precedence e2e guard).

**Architecture:** Extend the existing `ProductSearch` provider (ADR-009) with a `suggest()` method implemented by `PostgresProductSearch` using a sanitized prefix `to_tsquery` over the slice-1 K2 GIN index (scalars only, no hydrate). Add `@Get('suggest')` to the existing `SearchController`. Two independent refactor/test follow-ups land as their own tasks.

**Tech Stack:** NestJS 11, TypeScript (strict), Prisma 7 (`@prisma/adapter-pg`), PostgreSQL FTS (`to_tsquery` prefix `:*` / `ts_rank` / GIN), Jest (unit + e2e via `test/jest-e2e.json` + supertest), class-validator/class-transformer, `curl` (HTTP smoke).

## Global Constraints

- Strict TypeScript; **no `any`** (test mocks may use `as never` / typed `mock.calls` casts, matching existing specs).
- Raw SQL via `prisma.$queryRaw` (tagged template, auto-parameterized). The value bound to `to_tsquery` is the **sanitized tsquery string** built by `buildPrefixTsQuery`, never raw user input.
- `suggest` is **`@Public`**, **ACTIVE-only** (`status = 'ACTIVE' AND deletedAt IS NULL`), **all sellers**, no auth/seller-scope.
- Suggestion shape is exactly `{ id: string; name: string; price: string; salePrice: string | null }` — link by `id` (Product has **no** `slug`); `price`/`salePrice` are Postgres `numeric` → strings; `salePrice` nullable. No relations.
- The `suggest` `@@` match expression MUST be `to_tsvector('english', p.name || ' ' || coalesce(p.description, ''))` (identical to the K2 index) so the GIN index is used. No new migration.
- `limit` default 8, `@Min(1) @Max(20)`. Blank/whitespace `q` or `q` sanitizing to zero tokens → `[]` with no DB call.
- DB is `ecom_dev` (shadow `ecom_shadow`), user `sotsys033`, no password. Never touch `ecomm`.
- Verify with `npx tsc --noEmit` (build hides tsc errors) AND a real boot+HTTP smoke. 3 pre-existing tsc errors exist in unrelated specs (`low-stock.listener.spec` ×2, `seller-mask.spec` ×1) — ignore them; confirm zero NEW errors.
- Worktree already needs `.env` with a 32-byte base64 `KYC_ENC_KEY` for the API to boot (already set up in this worktree).
- No `git push` without explicit user permission. Commit locally per task.
- Run from the worktree root `/Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/.claude/worktrees/feat-search-v2-slice2`; never cd to the original repo.

---

### Task 1: Follow-up #1 — share one `PRODUCT_INCLUDE` (dedupe)

**Files:**
- Modify: `apps/api/src/products/products.service.ts:32` (add `export`)
- Modify: `apps/api/src/search/product-search.ts` (remove local include, re-export the catalog one)
- Test: existing `apps/api/src/search/postgres-product-search.spec.ts` (must still pass; behavior-preserving)

**Interfaces:**
- Consumes: catalog `PRODUCT_INCLUDE` (`{ category: true, images: { orderBy: { position: 'asc' } }, seller: { select: { displayName: true, slug: true } } }`).
- Produces: `product-search.ts` still exports `PRODUCT_SEARCH_INCLUDE` (now an alias of the catalog const) and `ProductSearchItem` (derived from it) — so `postgres-product-search.ts` is unchanged.

- [ ] **Step 1: Export the catalog include**

In `apps/api/src/products/products.service.ts`, change line 32 from:
```typescript
const PRODUCT_INCLUDE = {
```
to:
```typescript
export const PRODUCT_INCLUDE = {
```
(Leave the object body and the `satisfies Prisma.ProductInclude` exactly as-is.)

- [ ] **Step 2: Re-point the search seam at the shared const**

In `apps/api/src/search/product-search.ts`, replace the top of the file — remove the local `PRODUCT_SEARCH_INCLUDE` declaration and re-export the catalog one. Replace:
```typescript
import { Prisma } from '@prisma/client';

/** Relations included so a search hit renders identically to a catalog card. */
export const PRODUCT_SEARCH_INCLUDE = {
  category: true,
  images: { orderBy: { position: 'asc' as const } },
  seller: { select: { displayName: true, slug: true } },
} satisfies Prisma.ProductInclude;

/** A search result row: a Product plus the included relations. */
export type ProductSearchItem = Prisma.ProductGetPayload<{
  include: typeof PRODUCT_SEARCH_INCLUDE;
}>;
```
with:
```typescript
import { Prisma } from '@prisma/client';
import { PRODUCT_INCLUDE } from '../products/products.service';

/**
 * Search hits render identically to catalog cards — reuse the catalog's
 * single include definition (one source of truth; cannot drift).
 */
export const PRODUCT_SEARCH_INCLUDE = PRODUCT_INCLUDE;

/** A search result row: a Product plus the included relations. */
export type ProductSearchItem = Prisma.ProductGetPayload<{
  include: typeof PRODUCT_SEARCH_INCLUDE;
}>;
```
(Keep everything below — `ProductSearchResult`, `ProductSearch`, `PRODUCT_SEARCH` — unchanged.)

- [ ] **Step 3: Verify the existing search suite + types still pass (behavior-preserving)**

Run: `cd apps/api && npx jest src/search && npx tsc --noEmit 2>&1 | grep -E "src/search/|src/products/" || echo "no new errors in search/products"`
Expected: search tests pass; no NEW tsc errors in `src/search/` or `src/products/`. (The 3 pre-existing unrelated errors may still print from other files — ignore.)

- [ ] **Step 4: Guard against an import cycle**

Run: `cd apps/api && node -e "require('ts-node/register'); require('./src/search/product-search.ts'); console.log('loads OK')" 2>&1 | tail -3` — if ts-node isn't available, instead boot-check in Task 5. The real cycle check: confirm `products.service.ts` does NOT import from `../search` (it must not, or `search → products → search` cycles).
Run: `grep -n "from '../search" apps/api/src/products/products.service.ts || echo "no search import in products.service (good — no cycle)"`
Expected: `no search import in products.service (good — no cycle)`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/products/products.service.ts apps/api/src/search/product-search.ts
git commit -m "refactor(m3c): share one PRODUCT_INCLUDE between catalog and search"
```

---

### Task 2: `SuggestProductsDto`

**Files:**
- Create: `apps/api/src/search/dto/suggest-products.dto.ts`
- Test: `apps/api/src/search/dto/suggest-products.dto.spec.ts`

**Interfaces:**
- Produces: `class SuggestProductsDto { q?: string; limit?: number }` — `q` optional string MaxLength 200; `limit` optional int `@Min(1) @Max(20)`, coerced via `@Type(() => Number)`.

- [ ] **Step 1: Write the failing test**

```typescript
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SuggestProductsDto } from './suggest-products.dto';

const make = (obj: Record<string, unknown>) =>
  plainToInstance(SuggestProductsDto, obj, { enableImplicitConversion: false });

describe('SuggestProductsDto', () => {
  it('accepts q and coerces limit from a string', async () => {
    const dto = make({ q: 'auro', limit: '5' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.limit).toBe(5);
  });

  it('rejects limit < 1', async () => {
    const errors = await validate(make({ q: 'x', limit: '0' }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects limit > 20', async () => {
    const errors = await validate(make({ q: 'x', limit: '21' }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('allows all fields omitted (blank q handled by the service)', async () => {
    const errors = await validate(make({}));
    expect(errors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/search/dto/suggest-products.dto.spec.ts`
Expected: FAIL — cannot find module `./suggest-products.dto`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query for the public autocomplete endpoint. Params arrive as strings;
 * `@Type(() => Number)` coerces `limit` under the global transforming pipe.
 * A blank/whitespace `q` (or one that sanitizes to no tokens) is valid here
 * and short-circuits to an empty array in the service (no DB hit).
 */
export class SuggestProductsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/search/dto/suggest-products.dto.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/search/dto/suggest-products.dto.ts apps/api/src/search/dto/suggest-products.dto.spec.ts
git commit -m "feat(m3c): SuggestProductsDto for product autocomplete"
```

---

### Task 3: `buildPrefixTsQuery` (the sanitized token builder)

**Files:**
- Create: `apps/api/src/search/build-prefix-tsquery.ts`
- Test: `apps/api/src/search/build-prefix-tsquery.spec.ts`

**Interfaces:**
- Produces: `function buildPrefixTsQuery(q: string): string | null` — sanitizes free text into a Postgres prefix tsquery string, or `null` if no usable tokens. Lowercase; split on non-alphanumerics; drop empties; join tokens with ` & `; append `:*` to the last token.

- [ ] **Step 1: Write the failing test**

```typescript
import { buildPrefixTsQuery } from './build-prefix-tsquery';

describe('buildPrefixTsQuery', () => {
  it('adds a prefix marker to a single token', () => {
    expect(buildPrefixTsQuery('auro')).toBe('auro:*');
  });

  it('ANDs complete tokens and prefixes only the last', () => {
    expect(buildPrefixTsQuery('aurora sma')).toBe('aurora & sma:*');
  });

  it('lowercases and collapses extra whitespace', () => {
    expect(buildPrefixTsQuery('  Aurora   X ')).toBe('aurora & x:*');
  });

  it('splits on non-alphanumerics', () => {
    expect(buildPrefixTsQuery('red-shoes')).toBe('red & shoes:*');
  });

  it('keeps digits (alphanumeric tokens)', () => {
    expect(buildPrefixTsQuery('iphone 15')).toBe('iphone & 15:*');
  });

  it('returns null for empty input', () => {
    expect(buildPrefixTsQuery('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(buildPrefixTsQuery('   ')).toBeNull();
  });

  it('returns null when input has no alphanumeric tokens', () => {
    expect(buildPrefixTsQuery('!!! @# ')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/search/build-prefix-tsquery.spec.ts`
Expected: FAIL — cannot find module `./build-prefix-tsquery`.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Turn free-text autocomplete input into a safe Postgres prefix tsquery
 * string for `to_tsquery('english', …)`. Splitting on non-alphanumerics and
 * rebuilding the query ourselves is what keeps `to_tsquery` from throwing on
 * arbitrary user input (it rejects malformed query syntax). The last token
 * gets the `:*` prefix marker so a partially-typed word still matches.
 *
 * Returns `null` when there is no usable token (caller short-circuits to []).
 *
 * Examples: "auro" → "auro:*"; "aurora sma" → "aurora & sma:*";
 *           "!!!" → null; "" → null.
 */
export function buildPrefixTsQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return null;

  const lastIndex = tokens.length - 1;
  return tokens.map((t, i) => (i === lastIndex ? `${t}:*` : t)).join(' & ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/search/build-prefix-tsquery.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/search/build-prefix-tsquery.ts apps/api/src/search/build-prefix-tsquery.spec.ts
git commit -m "feat(m3c): buildPrefixTsQuery — sanitized prefix tsquery builder"
```

---

### Task 4: Extend the `ProductSearch` seam with `suggest()`

**Files:**
- Modify: `apps/api/src/search/product-search.ts` (add `ProductSuggestion` + `suggest` to the interface)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `interface ProductSuggestion { id: string; name: string; price: string; salePrice: string | null }`
  - `ProductSearch` interface gains `suggest(q: string, limit: number): Promise<ProductSuggestion[]>`.

- [ ] **Step 1: Add the type and interface method**

In `apps/api/src/search/product-search.ts`, add the `ProductSuggestion` interface just above the `ProductSearch` interface, and add the `suggest` method to `ProductSearch`. After the change the relevant section reads:
```typescript
/** A lean autocomplete row — enough to render a dropdown entry and link by id. */
export interface ProductSuggestion {
  id: string;
  name: string;
  price: string;
  salePrice: string | null;
}

/**
 * Swappable product-search seam (ADR-009). The default binding is the
 * Postgres GIN FTS impl (ADR-011); an Elasticsearch adapter can be bound by
 * env later without touching the controller.
 */
export interface ProductSearch {
  search(
    q: string,
    page: number,
    pageSize: number,
  ): Promise<ProductSearchResult>;

  /** Ranked, ACTIVE-only, prefix-matched autocomplete suggestions (capped at `limit`). */
  suggest(q: string, limit: number): Promise<ProductSuggestion[]>;
}
```

- [ ] **Step 2: Verify it type-checks (the impl is added next task; expect a tsc error THAT names PostgresProductSearch)**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep "postgres-product-search" || echo "no impl error yet"`
Expected: a tsc error like `Class 'PostgresProductSearch' incorrectly implements interface 'ProductSearch'. Property 'suggest' is missing` — this is EXPECTED (it's the red state; Task 5 implements `suggest`). If you prefer, you may do Tasks 4 and 5 in one commit; otherwise this task's tsc is intentionally red until Task 5.

- [ ] **Step 3: Commit (interface + impl land together to keep the build green — see note)**

This task has no independently-green state (adding an interface method without its impl breaks tsc). **Do NOT commit Task 4 alone.** Proceed directly to Task 5; the commit at the end of Task 5 covers both the interface method and its implementation. (This task exists to specify the interface shape the implementer must add.)

---

### Task 5: Implement `suggest()` in `PostgresProductSearch`

**Files:**
- Modify: `apps/api/src/search/postgres-product-search.ts`
- Test: `apps/api/src/search/postgres-product-search.spec.ts` (extend the existing suite)

**Interfaces:**
- Consumes: `buildPrefixTsQuery` (Task 3); `ProductSearch`/`ProductSuggestion` (Task 4); `PrismaService.$queryRaw`.
- Produces: `PostgresProductSearch.suggest(q, limit): Promise<ProductSuggestion[]>`.

> The raw query returns scalar columns; the unit test mocks `$queryRaw` and asserts the orchestration (blank/zero-token short-circuit with no DB call; `$queryRaw` called with the built tsquery + limit; row→`ProductSuggestion` mapping incl. `salePrice: null`). Raw-SQL correctness is proven in Task 7's HTTP smoke.

- [ ] **Step 1: Write the failing tests (append to the existing spec's `describe`)**

Add this block inside `describe('PostgresProductSearch', () => { ... })` in `apps/api/src/search/postgres-product-search.spec.ts`:
```typescript
  describe('suggest', () => {
    type SuggestRow = {
      id: string;
      name: string;
      price: string;
      salePrice: string | null;
      rank: number;
    };

    const buildSuggest = (rows: SuggestRow[]) => {
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue(rows),
        product: { findMany: jest.fn() },
      };
      const svc = new PostgresProductSearch(prisma as never);
      return { svc, prisma };
    };

    it('short-circuits a blank query to [] with no DB call', async () => {
      const { svc, prisma } = buildSuggest([]);
      const res = await svc.suggest('   ', 8);
      expect(res).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('short-circuits a tokenless query (e.g. "!!!") to [] with no DB call', async () => {
      const { svc, prisma } = buildSuggest([]);
      const res = await svc.suggest('!!!', 8);
      expect(res).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('queries and maps rows to lean suggestions, preserving null salePrice', async () => {
      const rows: SuggestRow[] = [
        { id: 'a', name: 'Aurora X', price: '799.00', salePrice: '699.00', rank: 0.9 },
        { id: 'b', name: 'Aurora Lite', price: '399.00', salePrice: null, rank: 0.5 },
      ];
      const { svc, prisma } = buildSuggest(rows);
      const res = await svc.suggest('auro', 8);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(res).toEqual([
        { id: 'a', name: 'Aurora X', price: '799.00', salePrice: '699.00' },
        { id: 'b', name: 'Aurora Lite', price: '399.00', salePrice: null },
      ]);
    });
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd apps/api && npx jest src/search/postgres-product-search.spec.ts -t suggest`
Expected: FAIL — `suggest` is not a function / not implemented.

- [ ] **Step 3: Implement `suggest`**

In `apps/api/src/search/postgres-product-search.ts`: add the import and a `RawSuggestRow` interface, and the `suggest` method on the class. Add the import at the top:
```typescript
import { buildPrefixTsQuery } from './build-prefix-tsquery';
import {
  ProductSearch,
  ProductSearchItem,
  ProductSearchResult,
  ProductSuggestion,
  PRODUCT_SEARCH_INCLUDE,
} from './product-search';
```
(replace the existing `./product-search` import to add `ProductSuggestion`). Add a row type near `RankedRow`:
```typescript
/** One scalar row from the autocomplete query. */
interface RawSuggestRow {
  id: string;
  name: string;
  price: string;
  salePrice: string | null;
  rank: number;
}
```
Add the method to the class (after `search`):
```typescript
  async suggest(q: string, limit: number): Promise<ProductSuggestion[]> {
    const tsquery = buildPrefixTsQuery(q);
    if (tsquery === null) return [];

    // $1 = sanitized prefix tsquery string (built from alphanumeric tokens only,
    // so to_tsquery never throws); $2 = limit. The @@ expression matches the K2
    // GIN index. Scalars only — no relation hydrate needed for a dropdown row.
    const rows = await this.prisma.$queryRaw<RawSuggestRow[]>`
      SELECT p.id, p.name, p.price, p."salePrice",
             ts_rank(
               setweight(to_tsvector('english', p.name), 'A') ||
               setweight(to_tsvector('english', coalesce(p.description, '')), 'B'),
               to_tsquery('english', ${tsquery})
             ) AS rank
      FROM "Product" p
      WHERE p."deletedAt" IS NULL
        AND p.status = 'ACTIVE'
        AND to_tsvector('english', p.name || ' ' || coalesce(p.description, ''))
            @@ to_tsquery('english', ${tsquery})
      ORDER BY rank DESC, p."createdAt" DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      price: r.price,
      salePrice: r.salePrice,
    }));
  }
```

- [ ] **Step 4: Run the search suite + type-check**

Run: `cd apps/api && npx jest src/search/postgres-product-search.spec.ts && npx tsc --noEmit 2>&1 | grep "src/search/" || echo "no search tsc errors"`
Expected: all tests pass (slice-1 search tests + the new `suggest` tests); no tsc errors in `src/search/`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/search/product-search.ts apps/api/src/search/postgres-product-search.ts apps/api/src/search/postgres-product-search.spec.ts
git commit -m "feat(m3c): PostgresProductSearch.suggest — prefix FTS autocomplete (scalars)"
```

---

### Task 6: Add `GET /products/suggest` to `SearchController`

**Files:**
- Modify: `apps/api/src/search/search.controller.ts`
- Test: `apps/api/src/search/search.controller.spec.ts` (extend the existing suite)

**Interfaces:**
- Consumes: `ProductSearch.suggest` (Task 4/5); `SuggestProductsDto` (Task 2); `@Public`.
- Produces: route `GET /products/suggest` delegating `suggest(q ?? '', limit ?? 8)`.

- [ ] **Step 1: Write the failing controller test (append to the existing describe)**

Add to `apps/api/src/search/search.controller.spec.ts`. The existing spec uses a `makeSearch()` factory returning `{ searchFn, stub }` where `stub` is cast to `ProductSearch`. Match that pattern — add a sibling factory exposing a `suggestFn`, and add a `describe('suggest', …)` block at the end of the file's top-level `describe('SearchController', …)`:
```typescript
  describe('suggest', () => {
    const makeSuggest = () => {
      const suggestFn = jest.fn().mockResolvedValue([]);
      // Cast to ProductSearch so the controller constructor receives the correct type.
      return { suggestFn, stub: { suggest: suggestFn } as unknown as ProductSearch };
    };

    it('delegates to ProductSearch.suggest with DTO values', async () => {
      const { suggestFn, stub } = makeSuggest();
      const ctrl = new SearchController(stub);
      await ctrl.suggest({ q: 'auro', limit: 5 });
      expect(suggestFn).toHaveBeenCalledWith('auro', 5);
    });

    it('applies defaults when q/limit are omitted', async () => {
      const { suggestFn, stub } = makeSuggest();
      const ctrl = new SearchController(stub);
      await ctrl.suggest({});
      expect(suggestFn).toHaveBeenCalledWith('', 8);
    });
  });
```
(`import type { ProductSearch } from './product-search';` is already imported at the top of the existing spec — reuse it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/search/search.controller.spec.ts -t suggest`
Expected: FAIL — `ctrl.suggest` is not a function.

- [ ] **Step 3: Add the handler**

In `apps/api/src/search/search.controller.ts`: import the DTO and add the handler. Add the import:
```typescript
import { SuggestProductsDto } from './dto/suggest-products.dto';
```
Add the method after `search`:
```typescript
  @Public()
  @Get('suggest')
  suggest(@Query() query: SuggestProductsDto) {
    return this.productSearch.suggest(query.q ?? '', query.limit ?? 8);
  }
```

- [ ] **Step 4: Run the controller test + type-check**

Run: `cd apps/api && npx jest src/search/search.controller.spec.ts && npx tsc --noEmit 2>&1 | grep "src/search/" || echo "no search tsc errors"`
Expected: all controller tests pass; no tsc errors in `src/search/`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/search/search.controller.ts apps/api/src/search/search.controller.spec.ts
git commit -m "feat(m3c): GET /products/suggest endpoint (@Public)"
```

---

### Task 7: Follow-up #2 — route-precedence e2e guard + full-suite + HTTP smoke

**Files:**
- Create: `apps/api/test/search-routes.e2e-spec.ts`
- Modify: `apps/api/scripts/smoke-search.sh` (append `/products/suggest` checks)

**Interfaces:**
- Consumes: the booted `AppModule`; existing seed (Aurora products ACTIVE).
- Produces: an e2e guard proving both static `/products/*` routes resolve, plus a suggest HTTP smoke.

- [ ] **Step 1: Write the e2e guard (mirrors `test/public-sellers.e2e-spec.ts` boot)**

Create `apps/api/test/search-routes.e2e-spec.ts`:
```typescript
/**
 * e2e: search/suggest route precedence.
 *
 * Both `GET /products/search` and `GET /products/suggest` are static routes
 * under `/products`, mounted by SearchModule. ProductsController also mounts
 * `GET /products/:id`. Express matches in registration order, so SearchModule
 * MUST be imported before ProductsModule in app.module.ts. This guard fails
 * (404) if that ordering regresses — a level unit tests cannot catch.
 *
 * No seeding required: the assertion is route resolution (status !== 404),
 * not result contents.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('search routes (precedence)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /products/search resolves (not shadowed by /products/:id)', async () => {
    const res = await request(app.getHttpServer()).get(
      '/products/search?q=aurora',
    );
    expect(res.status).toBe(200);
  });

  it('GET /products/suggest resolves (not shadowed by /products/:id)', async () => {
    const res = await request(app.getHttpServer()).get(
      '/products/suggest?q=aurora',
    );
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the e2e guard**

Run: `cd apps/api && npm run test:e2e -- search-routes`
Expected: PASS (2 tests, both 200). If either is 404, the module order regressed — confirm `SearchModule` is before `ProductsModule` in `src/app.module.ts`.

- [ ] **Step 3: Confirm the guard actually catches the regression (sanity)**

Temporarily check the ordering is what makes it pass: `grep -nE "SearchModule|ProductsModule" apps/api/src/app.module.ts` — confirm `SearchModule` line precedes `ProductsModule`. (Do not commit any reorder; just confirm.)

- [ ] **Step 4: Append suggest checks to the smoke script**

Add to `apps/api/scripts/smoke-search.sh`, just before the final `echo "ALL SMOKE CHECKS PASSED"`:
```bash
echo "== suggest: prefix 'auro' returns Aurora products (lean shape) =="
curl -s "$BASE/products/suggest?q=auro" | python3 -c '
import sys, json
r = json.load(sys.stdin)
assert isinstance(r, list), "suggest returns a bare array"
assert len(r) >= 1, "prefix auro should match Aurora products"
names = [x["name"] for x in r]
print("suggest auro:", names)
for x in r:
    assert set(x.keys()) == {"id", "name", "price", "salePrice"}, "lean shape only"
assert all("Aurora" in n for n in names), "prefix match should hit Aurora"
print("OK")'

echo "== suggest: narrowing 'aurora sma' still matches =="
curl -s --get "$BASE/products/suggest" --data-urlencode "q=aurora sma" | python3 -c '
import sys, json
r = json.load(sys.stdin)
assert len(r) >= 1, "aurora sma should still match Aurora Smartphone"
print("aurora sma ->", [x["name"] for x in r], "OK")'

echo "== suggest: limit respected =="
curl -s "$BASE/products/suggest?q=a&limit=1" | python3 -c '
import sys, json
r = json.load(sys.stdin)
assert len(r) <= 1, "limit=1 caps the array"
print("limit=1 len:", len(r), "OK")'

echo "== suggest: blank q -> [] =="
curl -s "$BASE/products/suggest?q=" | python3 -c '
import sys, json
r = json.load(sys.stdin)
assert r == [], "blank q is an empty array"
print("blank OK")'
```

- [ ] **Step 5: Run the full unit suite, lint, tsc gate**

Run: `cd apps/api && npx jest && npm run lint && npx tsc --noEmit 2>&1 | grep -v -E "low-stock.listener.spec|seller-mask.spec" | grep "error TS" || echo "no NEW tsc errors"`
Expected: all unit tests green (incl. new suggest/DTO/builder tests); lint clean; only the 3 pre-existing tsc errors (filtered out → "no NEW tsc errors").

- [ ] **Step 6: Boot the API and run the HTTP smoke vs ecom_dev**

```bash
cd apps/api
lsof -ti:5000 | xargs kill -9 2>/dev/null   # clear any stale server (see memory: stale :5000)
npx prisma migrate deploy   # apply pending migrations only (shared ecom_dev; do NOT migrate dev)
npm run start:dev &          # background; wait for "Mapped {/products/suggest, GET}" + "successfully started"
# then in the same/another shell:
bash scripts/smoke-search.sh
```
Expected: boot log shows `Mapped {/products/suggest, GET}` AND `/products/suggest` mapped BEFORE `/products/:id`; smoke prints `ALL SMOKE CHECKS PASSED` (incl. the new suggest checks). Kill the server when done (`lsof -ti:5000 | xargs kill -9`).

- [ ] **Step 7: Verify the GIN index serves suggest (EXPLAIN)**

Run:
```bash
psql -U sotsys033 -d ecom_dev -c "SET enable_seqscan=off; EXPLAIN SELECT id FROM \"Product\" WHERE to_tsvector('english', name || ' ' || coalesce(description,'')) @@ to_tsquery('english','auro:*');" | grep -i "Product_fts_idx" && echo "index used"
```
Expected: plan references `Product_fts_idx`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/test/search-routes.e2e-spec.ts apps/api/scripts/smoke-search.sh
git commit -m "test(m3c): route-precedence e2e guard + /products/suggest HTTP smoke"
```

---

### Task 8: Update the roadmap status

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md` (M3c note)

**Interfaces:**
- Consumes: nothing. Produces: M3c note reflecting slice 2 done + follow-ups closed.

- [ ] **Step 1: Update the M3c note**

In `docs/IMPLEMENTATION_PLAN.md`, in the M3 row's M3c portion, append after the slice-1 sentence:
*"**Slice 2 (autocomplete + follow-ups) ✅** — `GET /products/suggest` (prefix `to_tsquery` over K2 GIN, lean `{id,name,price,salePrice}` rows on the `ProductSearch` seam, `@Public`/ACTIVE-only); plus slice-1 review follow-ups closed: shared one `PRODUCT_INCLUDE` (catalog⇄search) and added `search-routes.e2e-spec.ts` guarding `/products/search` + `/products/suggest` precedence. Unit + e2e + HTTP-smoked vs `ecom_dev`. **Next M3c slices:** (3) faceted filters; (4) storefront autocomplete + facet UI."*
(Match the existing note style.)

- [ ] **Step 2: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m3c): mark search slice 2 (autocomplete + follow-ups) done"
```

---

## Self-Review

**Spec coverage:**
- Autocomplete feature (suggest on seam, impl, endpoint, DTO) → Tasks 2, 4, 5, 6. ✅
- `buildPrefixTsQuery` sanitized prefix builder → Task 3. ✅
- Suggestion shape `{id,name,price,salePrice}`, link by id, scalars-only → Tasks 4, 5 (Global Constraints). ✅
- Same K2 index expression, no migration → Task 5 SQL (constraint). ✅
- `limit` 8/max 20, blank/zero-token → [] no DB → Tasks 2, 3, 5. ✅
- Follow-up #1 share PRODUCT_INCLUDE → Task 1. ✅
- Follow-up #2 route-precedence e2e → Task 7. ✅
- Error handling (400, [], no to_tsquery throw, public) → Tasks 2, 3, 5, 6. ✅
- Testing (builder unit, suggest unit, controller unit, DTO unit, e2e, HTTP smoke incl. prefix) → Tasks 2,3,5,6,7. ✅
- Acceptance (prefix match, garbage-safe, swappable seam, index used, dedup, e2e guard, all green) → Task 7 gate covers. ✅

**Placeholder scan:** No TBD/TODO; every code step has full code; smoke + e2e are complete. ✅ (Task 4 explicitly has no standalone commit — its impl lands with Task 5; this is intentional and stated, not a placeholder.)

**Type consistency:** `suggest(q: string, limit: number): Promise<ProductSuggestion[]>` identical across Task 4 (interface), Task 5 (impl), Task 6 (controller call + test). `ProductSuggestion` fields `{id,name,price,salePrice}` consistent in Tasks 4/5/6/7. `buildPrefixTsQuery(q: string): string | null` consistent Task 3 ↔ Task 5. `PRODUCT_SEARCH_INCLUDE` remains the exported name after Task 1 (alias), so Task 5's import is valid. ✅
