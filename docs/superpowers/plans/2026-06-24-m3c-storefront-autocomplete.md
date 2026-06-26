# M3c Search — Slice 4b: Storefront Autocomplete Search Box Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible, debounced autocomplete search box to the storefront header, backed by `/products/suggest` through a same-origin Next route-handler proxy.

**Architecture:** Client `SearchAutocomplete` component → `fetch('/api/products/suggest')` (same-origin Next route handler) → `suggestProducts` data layer → API `GET /products/suggest`. Keeps `API_URL` server-only. Enter/submit navigates to `/products?search=<term>` (the slice-4a faceted page). Only the autocomplete component is a Client Component; the header + route handler stay server-side.

**Tech Stack:** Next.js (App Router; one Client Component + a route handler) + TypeScript (strict), Tailwind (DESIGN.md tokens, no hardcoded hex), Vitest + RTL (fake timers for debounce, mocked global `fetch`, mocked `next/navigation`). API consumed server-to-server.

## Global Constraints

- Strict TypeScript; no `any`. Match existing patterns: `lib/catalog.ts` (`CatalogOptions`/`toQuery`/`CatalogError`/`messageFrom`/`cache:'no-store'`), and the route-handler trio in `src/app/api/cart/` (`route.ts` thin entry → `handlers.ts` returning `{ status, body }` with an injectable `Deps` interface → `route-deps.ts` with `import 'server-only'`).
- `API_URL` stays SERVER-ONLY: the browser never fetches the API directly. Client → `/api/products/suggest` (same origin) → handler → `suggestProducts({...}, { baseUrl: process.env.API_URL })`.
- Suggest is `@Public`: the proxy forwards no auth/cookies.
- **Autocomplete degrades silently:** any suggest failure (network/API/parse) → handler returns `[]` with HTTP 200; the client shows no dropdown; typing + Enter→`/products?search=` still work. Never throw to the page.
- **Submit contract:** Enter / form submit (no suggestion highlighted) → navigate to `/products?search=<term>` — the page param is `search` (NOT `q`), per the slice-4a contract. `encodeURIComponent` the term.
- Suggest fires only when `term.trim().length >= 2`, debounced ~250ms; stale-response guard (AbortController or latest-query check). No fetch on mount/SSR (dropdown closed initially → no hydration mismatch).
- Accessibility is a hard requirement: ARIA combobox (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; listbox/option/`aria-selected`); keyboard ↓/↑/Enter/Esc; visible focus; click-outside closes. Tailwind DESIGN.md tokens only — no hardcoded hex.
- `ProductSuggestion = { id: string; name: string; price: string; salePrice: string | null }` (mirrors the API; price strings).
- Storefront tests mock fetch/router — no live API in unit tests. `npm test` = `vitest run`; single: `npm test -- <pattern>`. Run `npm run lint` before each commit.
- Verify with `npm run lint` AND `npm run build` AND a browser smoke vs `ecom_dev` before "done".
- No `git push` without explicit user permission. Commit per task. Run from the worktree root `/Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/.claude/worktrees/feat-search-v2-slice4b`; app is `apps/storefront`.

---

### Task 1: Data layer — `suggestProducts` + `ProductSuggestion`

**Files:**
- Modify: `apps/storefront/src/lib/catalog.ts`
- Test: `apps/storefront/src/lib/catalog.test.ts` (extend)

**Interfaces:**
- Consumes: existing `CatalogOptions`, `toQuery`, `CatalogError`, `messageFrom`.
- Produces:
  - `interface ProductSuggestion { id: string; name: string; price: string; salePrice: string | null }`
  - `suggestProducts(query: { q?: string; limit?: number }, opts: CatalogOptions): Promise<ProductSuggestion[]>`

- [ ] **Step 1: Write the failing tests (append to `catalog.test.ts`)**

Reuse the file's existing mock-fetch helper style. Append:
```typescript
describe('suggestProducts', () => {
  const makeFetch = (body: unknown, ok = true, status = 200) =>
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    }) as unknown as typeof fetch;

  const rows = [
    { id: 'p1', name: 'Aurora Smartphone X', price: '799.00', salePrice: null },
    { id: 'p2', name: 'Aurora Lite', price: '399.00', salePrice: '349.00' },
  ];

  it('builds the /products/suggest URL with q + limit', async () => {
    const fetchImpl = makeFetch(rows);
    await suggestProducts({ q: 'aur', limit: 8 }, { baseUrl: 'http://api.test', fetch: fetchImpl });
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('http://api.test/products/suggest?');
    expect(url).toContain('q=aur');
    expect(url).toContain('limit=8');
  });

  it('returns the parsed suggestion array', async () => {
    const result = await suggestProducts({ q: 'aur' }, { baseUrl: 'http://api.test', fetch: makeFetch(rows) });
    expect(result).toEqual(rows);
  });

  it('throws CatalogError on a non-2xx response', async () => {
    await expect(
      suggestProducts({ q: 'x' }, { baseUrl: 'http://api.test', fetch: makeFetch({ message: 'bad' }, false, 400) }),
    ).rejects.toBeInstanceOf(CatalogError);
  });
});
```
(Extend the existing top-of-file import to include `suggestProducts` + `CatalogError` if not already imported.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/storefront && npm test -- catalog.test`
Expected: FAIL — `suggestProducts` not exported.

- [ ] **Step 3: Implement**

In `apps/storefront/src/lib/catalog.ts`, add the type near `SearchFacets`:
```typescript
/** A lean autocomplete suggestion (mirrors the API's ProductSuggestion). */
export interface ProductSuggestion {
  id: string;
  name: string;
  price: string;
  salePrice: string | null;
}
```
Add the fetcher near `searchProducts`:
```typescript
/** Lightweight product suggestions for autocomplete (GET /products/suggest). */
export async function suggestProducts(
  query: { q?: string; limit?: number },
  { baseUrl, fetch: fetchImpl = fetch }: CatalogOptions,
): Promise<ProductSuggestion[]> {
  const url = `${baseUrl}/products/suggest${toQuery({ q: query.q, limit: query.limit })}`;
  const res = await fetchImpl(url, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new CatalogError(messageFrom(body, res.status), res.status);
  return body as ProductSuggestion[];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/storefront && npm test -- catalog.test`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/storefront && npm run lint
cd ../.. && git add apps/storefront/src/lib/catalog.ts apps/storefront/src/lib/catalog.test.ts
git commit -m "feat(m3c): storefront suggestProducts data layer"
```

---

### Task 2: Route-handler proxy `GET /api/products/suggest`

**Files:**
- Create: `apps/storefront/src/app/api/products/suggest/handlers.ts`
- Create: `apps/storefront/src/app/api/products/suggest/route-deps.ts`
- Create: `apps/storefront/src/app/api/products/suggest/route.ts`
- Test: `apps/storefront/src/app/api/products/suggest/handlers.test.ts`

**Interfaces:**
- Consumes: `suggestProducts`/`ProductSuggestion` (Task 1).
- Produces:
  - `interface SuggestRouteDeps { suggest(query: { q: string; limit: number }): Promise<ProductSuggestion[]> }`
  - `interface SuggestHandlerResult { status: number; body: unknown }`
  - `handleSuggest(input: { q?: string; limit?: string }, deps: SuggestRouteDeps): Promise<SuggestHandlerResult>`
  - `liveSuggestRouteDeps(): SuggestRouteDeps`

> The handler takes a plain `{ q?, limit? }` (strings from searchParams) so it's testable without a Request. `route.ts` extracts them from `req.nextUrl.searchParams`. Blank/`<2`-char/absent `q` → `[]` (200) WITHOUT calling `suggest`. Any thrown error → `[]` (200), logged. `limit` parsed to an int, clamped to 1..20, default 8.

- [ ] **Step 1: Write the failing handler tests**

Create `apps/storefront/src/app/api/products/suggest/handlers.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { handleSuggest } from './handlers';

const rows = [{ id: 'p1', name: 'Aurora', price: '799.00', salePrice: null }];

describe('handleSuggest', () => {
  it('returns suggestions for a valid query', async () => {
    const suggest = vi.fn().mockResolvedValue(rows);
    const res = await handleSuggest({ q: 'aurora', limit: '8' }, { suggest });
    expect(suggest).toHaveBeenCalledWith({ q: 'aurora', limit: 8 });
    expect(res).toEqual({ status: 200, body: rows });
  });

  it('returns [] without calling suggest for a short query', async () => {
    const suggest = vi.fn();
    const res = await handleSuggest({ q: 'a' }, { suggest });
    expect(suggest).not.toHaveBeenCalled();
    expect(res).toEqual({ status: 200, body: [] });
  });

  it('returns [] without calling suggest when q is absent', async () => {
    const suggest = vi.fn();
    const res = await handleSuggest({}, { suggest });
    expect(suggest).not.toHaveBeenCalled();
    expect(res).toEqual({ status: 200, body: [] });
  });

  it('clamps limit to 1..20 and defaults to 8', async () => {
    const suggest = vi.fn().mockResolvedValue(rows);
    await handleSuggest({ q: 'aurora', limit: '999' }, { suggest });
    expect(suggest).toHaveBeenCalledWith({ q: 'aurora', limit: 20 });
    await handleSuggest({ q: 'aurora' }, { suggest });
    expect(suggest).toHaveBeenLastCalledWith({ q: 'aurora', limit: 8 });
  });

  it('degrades to [] (200) when suggest throws', async () => {
    const suggest = vi.fn().mockRejectedValue(new Error('API down'));
    const res = await handleSuggest({ q: 'aurora' }, { suggest });
    expect(res).toEqual({ status: 200, body: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/storefront && npm test -- "products/suggest/handlers.test"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `handlers.ts`**

```typescript
import type { ProductSuggestion } from '@/lib/catalog';

export interface SuggestHandlerResult {
  status: number;
  body: unknown;
}

/** Injectable suggest op so the handler is testable without env/Next. */
export interface SuggestRouteDeps {
  suggest(query: { q: string; limit: number }): Promise<ProductSuggestion[]>;
}

const MIN_CHARS = 2;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

function clampLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(n)));
}

/**
 * Proxy for /products/suggest. Short/absent queries short-circuit to []. Any
 * upstream failure degrades to [] (200) so autocomplete never breaks the page.
 */
export async function handleSuggest(
  input: { q?: string; limit?: string },
  deps: SuggestRouteDeps,
): Promise<SuggestHandlerResult> {
  const q = (input.q ?? '').trim();
  if (q.length < MIN_CHARS) return { status: 200, body: [] };
  try {
    const result = await deps.suggest({ q, limit: clampLimit(input.limit) });
    return { status: 200, body: result };
  } catch (err) {
    console.error('[suggest] upstream failure:', err);
    return { status: 200, body: [] };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/storefront && npm test -- "products/suggest/handlers.test"`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement `route-deps.ts` + `route.ts`**

`route-deps.ts`:
```typescript
import 'server-only';
import { suggestProducts } from '@/lib/catalog';
import type { SuggestRouteDeps } from './handlers';

/** Production wiring: proxy to the API with the server-only base URL. */
export function liveSuggestRouteDeps(): SuggestRouteDeps {
  return {
    suggest: (query) => suggestProducts(query, { baseUrl: process.env.API_URL as string }),
  };
}
```
`route.ts`:
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handleSuggest } from './handlers';
import { liveSuggestRouteDeps } from './route-deps';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const result = await handleSuggest(
    { q: params.get('q') ?? undefined, limit: params.get('limit') ?? undefined },
    liveSuggestRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 6: Type-check + lint**

Run: `cd apps/storefront && npm test -- "products/suggest/handlers.test" && npm run lint`
Expected: tests pass; lint clean. (route.ts/route-deps.ts are exercised at runtime/build; the handler is unit-tested.)

- [ ] **Step 7: Commit**

```bash
cd .. && git add apps/storefront/src/app/api/products/suggest
git commit -m "feat(m3c): /api/products/suggest route-handler proxy"
```

---

### Task 3: `SearchAutocomplete` client component

**Files:**
- Create: `apps/storefront/src/components/search/SearchAutocomplete.tsx`
- Test: `apps/storefront/src/components/search/SearchAutocomplete.test.tsx`

**Interfaces:**
- Consumes: `/api/products/suggest` (Task 2) via `fetch`; `next/navigation` `useRouter`; `ProductSuggestion` from `@/lib/catalog`.
- Produces: `export function SearchAutocomplete(): JSX.Element` — a self-contained `"use client"` combobox. No props (uses its own state + router).

> Debounce via `setTimeout` cleared on each keystroke; stale guard via an incrementing request id (ignore a response whose id isn't the latest). Suggest only at `term.trim().length >= 2`. Effective price = `salePrice ?? price`.

- [ ] **Step 1: Write the failing tests**

Create `apps/storefront/src/components/search/SearchAutocomplete.test.tsx`:
```typescript
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { SearchAutocomplete } from './SearchAutocomplete';

const rows = [
  { id: 'p1', name: 'Aurora Smartphone X', price: '799.00', salePrice: null },
  { id: 'p2', name: 'Aurora Lite', price: '399.00', salePrice: '349.00' },
];

const mockFetchOnce = (body: unknown) => {
  (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(body),
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
  global.fetch = vi.fn() as unknown as typeof fetch;
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

const type = (value: string) => {
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value } });
};

describe('SearchAutocomplete', () => {
  it('does not fetch for queries shorter than 2 chars', async () => {
    render(<SearchAutocomplete />);
    type('a');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('debounces then fetches suggestions and renders them', async () => {
    mockFetchOnce(rows);
    render(<SearchAutocomplete />);
    type('aur');
    expect(global.fetch).not.toHaveBeenCalled(); // not yet (debounce pending)
    await act(async () => { vi.advanceTimersByTime(250); });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const url = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/api/products/suggest?q=aur');
    expect(await screen.findByText('Aurora Smartphone X')).toBeInTheDocument();
  });

  it('navigates to a product when a suggestion is chosen via keyboard', async () => {
    mockFetchOnce(rows);
    render(<SearchAutocomplete />);
    type('aur');
    await act(async () => { vi.advanceTimersByTime(250); });
    await screen.findByText('Aurora Smartphone X');
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlight first
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/products/p1');
  });

  it('submits the raw term to /products?search= when no suggestion is highlighted', async () => {
    render(<SearchAutocomplete />);
    type('red shoes');
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/products?search=red%20shoes');
  });

  it('closes the dropdown on Escape', async () => {
    mockFetchOnce(rows);
    render(<SearchAutocomplete />);
    type('aur');
    await act(async () => { vi.advanceTimersByTime(250); });
    await screen.findByText('Aurora Smartphone X');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByText('Aurora Smartphone X')).not.toBeInTheDocument();
  });

  it('shows no dropdown when the request fails', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('net'));
    render(<SearchAutocomplete />);
    type('aur');
    await act(async () => { vi.advanceTimersByTime(250); });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/storefront && npm test -- SearchAutocomplete.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductSuggestion } from '@/lib/catalog';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;
const LISTBOX_ID = 'search-suggestions';

/** Effective display price: sale price when present, else the regular price. */
function displayPrice(s: ProductSuggestion): string {
  return s.salePrice ?? s.price;
}

/**
 * Accessible, debounced autocomplete combobox for the header. Suggestions come
 * from the same-origin /api/products/suggest proxy. Enter (with nothing
 * highlighted) submits the term to the faceted /products?search= page. A failed
 * suggest just yields no dropdown — typing + submit still work.
 */
export function SearchAutocomplete() {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // index into suggestions; -1 = none
  const reqId = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Debounced suggest fetch with a stale-response guard.
  useEffect(() => {
    const q = term.trim();
    if (q.length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      fetch(`/api/products/suggest?q=${encodeURIComponent(q)}&limit=8`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data: ProductSuggestion[]) => {
          if (id !== reqId.current) return; // stale
          setSuggestions(Array.isArray(data) ? data : []);
          setOpen((Array.isArray(data) ? data.length : 0) > 0);
          setActive(-1);
        })
        .catch(() => {
          if (id !== reqId.current) return;
          setSuggestions([]);
          setOpen(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  // Close on click outside.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function goToSearch() {
    const q = term.trim();
    if (q.length === 0) return;
    setOpen(false);
    router.push(`/products?search=${encodeURIComponent(q)}`);
  }

  function selectSuggestion(s: ProductSuggestion) {
    setOpen(false);
    router.push(`/products/${s.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setActive((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0 && active < suggestions.length) {
        selectSuggestion(suggestions[active]);
      } else {
        goToSearch();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const fieldClass =
    'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-content focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div ref={rootRef} className="relative w-full max-w-sm">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          goToSearch();
        }}
      >
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `suggestion-${active}` : undefined}
          aria-label="Search products"
          placeholder="Search products"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          className={fieldClass}
        />
      </form>
      {open && suggestions.length > 0 && (
        <ul
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Product suggestions"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-line bg-surface shadow-md"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`suggestion-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                i === active ? 'bg-primary-50 text-primary-700' : 'text-content hover:bg-neutral-50'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(s);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="truncate">{s.name}</span>
              <span className="shrink-0 text-content-subtle">{displayPrice(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```
(If a token class like `bg-primary-50`/`bg-neutral-50` is not in the theme, substitute the nearest existing DESIGN.md token used elsewhere in the app — check `CatalogFilters`/`ProductCard` for the active/hover tokens in use; do not introduce hex.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/storefront && npm test -- SearchAutocomplete.test`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/storefront && npm run lint
cd ../.. && git add apps/storefront/src/components/search
git commit -m "feat(m3c): SearchAutocomplete client combobox (debounced, a11y)"
```

---

### Task 4: Mount `SearchAutocomplete` in the header

**Files:**
- Modify: `apps/storefront/src/components/layout/SiteHeaderView.tsx`
- Modify: `apps/storefront/src/components/layout/MobileNav.tsx`
- Test: `apps/storefront/src/components/layout/SiteHeaderView.test.tsx` (extend)

**Interfaces:**
- Consumes: `SearchAutocomplete` (Task 3).
- Produces: header renders the search box (desktop + mobile).

> `SiteHeaderView` is a Server Component that renders a Client Component child — that's allowed (server can render client). No `"use client"` needed on the header.

- [ ] **Step 1: Write the failing test (extend `SiteHeaderView.test.tsx`)**

Append:
```typescript
it('renders the product search box', () => {
  render(<SiteHeaderView user={null} />);
  expect(screen.getByRole('combobox', { name: /search products/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/storefront && npm test -- SiteHeaderView.test`
Expected: FAIL — no combobox in the header yet.

- [ ] **Step 3: Mount it**

In `SiteHeaderView.tsx`: import `import { SearchAutocomplete } from '@/components/search/SearchAutocomplete';` and place `<SearchAutocomplete />` in the header layout (between the brand/nav and the cart/account actions — a sensible center slot; match the existing flex layout, e.g. wrap in a `<div className="hidden flex-1 justify-center px-4 md:flex">` so it sits centered on desktop). In `MobileNav.tsx`, render `<SearchAutocomplete />` near the top of the mobile menu panel (full width). Use only existing layout tokens; don't restructure unrelated markup.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/storefront && npm test -- SiteHeaderView.test`
Expected: PASS (existing + new). If `MobileNav` has its own test, run it too: `npm test -- MobileNav`.

- [ ] **Step 5: Lint + commit**

```bash
cd apps/storefront && npm run lint
cd ../.. && git add apps/storefront/src/components/layout
git commit -m "feat(m3c): mount SearchAutocomplete in header + mobile nav"
```

---

### Task 5: Full gate — suite, lint, build, browser smoke

**Files:** none (verification only).

- [ ] **Step 1: Full suite + lint + build**

```bash
cd apps/storefront
npm test                # all green (existing 228 + new)
npm run lint            # clean
npm run build           # succeeds (Next type-checks; route.ts + client component compile)
```
Expected: green / clean / build OK. Fix any build-only type error surfaced.

- [ ] **Step 2: Browser smoke vs `ecom_dev` (RULE.md §5)**

Start API (`:5000`, against `ecom_dev`) + storefront (`:5001`). Then:
- Focus the header search box, type `aur` → after ~250ms a dropdown of Aurora suggestions appears (name + price).
- Press ↓ then Enter → navigates to that product's `/products/[id]`.
- Type `aurora` and press Enter without selecting → navigates to `/products?search=aurora` (the slice-4a faceted page, ranked results + facets).
- Type `a` (1 char) → no dropdown.
- Stop the API mid-typing (or hit a bad query) → no dropdown appears, but Enter still navigates (degrades gracefully).
Record observations; fix + re-verify if anything fails.

- [ ] **Step 3: (Optional) Playwright e2e**

If cheap, add an e2e mirroring an existing storefront spec: load `/`, type in the search combobox, assert a suggestion appears (against seeded Aurora data), press Enter, assert URL is `/products?search=…`. Run `npm run test:e2e -- autocomplete`. Else rely on the documented manual smoke (Step 2) and note it.

- [ ] **Step 4: Commit any fixes** (only if Step 1–3 required changes)

```bash
cd .. && git add -A apps/storefront && git commit -m "fix(m3c): autocomplete smoke fixes"
```

---

### Task 6: Update the roadmap status — M3c COMPLETE

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Mark M3c done**

In the M3 row, change `M3c 🟡 (slices 1–3 + 4a done)` → `M3c ✅ COMPLETE`, and update the M3 phase status: if M3a/M3b/M3c are all ✅, change the M3 cell from `🟡 In Progress` to `✅ Done`. Append after the slice-4a sentence:
*"**Slice 4b (autocomplete search box) ✅ (branch `worktree-feat-search-v2-slice4b`)** — accessible debounced `SearchAutocomplete` combobox in the header (≥2 chars → 250ms debounce → same-origin `GET /api/products/suggest` route-handler proxy → `/products/suggest`; dropdown of name+price linking to product detail; ↓/↑/Enter/Esc + ARIA combobox; Enter w/o selection → `/products?search=`); `API_URL` stays server-only; suggest failures degrade to no-dropdown. New `suggestProducts` data layer + proxy handler + client component. Storefront tests (data/handler/component) + browser-smoked vs `ecom_dev`. **M3c Search COMPLETE (slices 1–4b).**"*

- [ ] **Step 2: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m3c): mark search slice 4b done — M3c Search complete"
```

---

## Self-Review

**Spec coverage:**
- `suggestProducts` + `ProductSuggestion` → Task 1. ✅
- Route-handler proxy (route/handlers/route-deps, `[]`-on-error, short-q guard, limit clamp) → Task 2. ✅
- `SearchAutocomplete` (debounce, stale-guard, dropdown, keyboard, ARIA, Esc/click-outside, submit→`/products?search=`, error→no-dropdown) → Task 3. ✅
- Mount in header + mobile → Task 4. ✅
- `API_URL` server-only (client→handler→API) → Task 2 (route-deps) + Task 3 (fetches same-origin `/api/products/suggest`). ✅
- Submit `search=` contract + encodeURIComponent → Task 3 `goToSearch`. ✅
- Tests: data + handler + component units + browser smoke → Tasks 1,2,3,5. ✅
- Verification gate (suite + lint + build + smoke) → Task 5. ✅
- Roadmap → Task 6 (marks M3c complete). ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code. Task 3's token-substitution note ("if a token isn't in the theme, use the nearest existing one") points the implementer at real files to check — concrete, not a placeholder (the behavior/structure is fully specified). Task 4 describes the mount slot in prose with exact import + a concrete wrapper className — acceptable since header markup varies; the test (combobox present) is the contract. ✅

**Type consistency:** `ProductSuggestion {id,name,price,salePrice}` identical Task 1 ↔ 2 ↔ 3. `suggestProducts(query:{q?,limit?}, opts)` consistent Task 1 ↔ route-deps. `SuggestRouteDeps.suggest({q,limit})` (numbers) consistent handler ↔ route-deps; `handleSuggest(input:{q?,limit?} strings, deps)` consistent handler ↔ route.ts. Client fetches `/api/products/suggest?q=&limit=8` matching the route. Submit target `/products?search=` matches the slice-4a page param. ✅
