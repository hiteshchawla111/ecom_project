# M3c Search — Slice 4b: Storefront Autocomplete Search Box (Design)

> **Date:** 2026-06-24 · **Phase:** M3c (Search), storefront · **Branch/worktree:** `worktree-feat-search-v2-slice4b` (off `main` @ `1566d45`)
> **Status:** Approved design. Implementation follows RULE.md (TDD; one slice; smoke-run the real thing).
> **Builds on:** M3c API slices 1–3 + storefront slice 4a (faceted `/products` page), all merged to `main`. Reads with the slice-2 (`/products/suggest`) and slice-4a design docs.

## Objective

Add an accessible, debounced **autocomplete search box** to the storefront header,
backed by the `/products/suggest` API via a Next route-handler proxy. This is the
**final M3c sub-slice** — completing the storefront search UX.

## Scope

**In scope**
- `lib/catalog.ts`: `suggestProducts()` + `ProductSuggestion` type.
- Next route handler `GET /api/products/suggest` (proxy → `suggestProducts`).
- `SearchAutocomplete` client component (debounced fetch, dropdown, keyboard nav, ARIA).
- Mount it in `SiteHeaderView` + `MobileNav`.

**Out of scope**
- Changing the `/products` page or facets (slice 4a, done).
- A "no matches" message in the dropdown (empty just closes — keep lean).
- Recent-searches / popular-queries / search analytics.

## Decisions (from brainstorming, 2026-06-24)

1. **Route-handler proxy** `GET /api/products/suggest` (client → same-origin Next handler →
   API server-to-server). Keeps `API_URL` server-only; no CORS / public URL. Mirrors the
   established `app/api/{cart,orders}` pattern. Suggest is `@Public` → no token forwarding. (Q1=A)
2. **Accessible debounced combobox** in the header: ≥2 chars → ~250ms debounce → fetch →
   dropdown (name + price, link to `/products/[id]`); Enter/submit → `/products?search=<term>`
   (slice-4a page; honors the `search=` param contract); full keyboard nav + ARIA combobox;
   Esc/click-outside close; errors → no dropdown, typing+Enter still work. (Q2=A)
3. **Unit-test all 3 layers (mocked) + browser smoke.** (Q3=A)

## Architecture

```
apps/storefront/src/
  lib/catalog.ts                            # EXTEND: suggestProducts() + ProductSuggestion
  app/api/products/suggest/route.ts          # NEW: GET → handleSuggest (thin; mirrors api/cart/route.ts)
  app/api/products/suggest/handlers.ts       # NEW: handleSuggest(req, deps) → suggestProducts → JSON
  app/api/products/suggest/route-deps.ts     # NEW: injects API_URL (mirrors existing route-deps)
  components/search/SearchAutocomplete.tsx    # NEW: "use client" combobox (debounce, keyboard, ARIA)
  components/layout/SiteHeaderView.tsx        # EXTEND: mount <SearchAutocomplete/>
  components/layout/MobileNav.tsx             # EXTEND: mount it for mobile
  (+ co-located *.test.ts(x))
```

**Data flow:** client `SearchAutocomplete` → `fetch('/api/products/suggest?q=…&limit=8')`
(same-origin) → handler → `suggestProducts(query, { baseUrl: API_URL })` server-to-server →
API `GET /products/suggest` → `ProductSuggestion[]`. Only `SearchAutocomplete` is `"use client"`;
header + route handler stay server-side.

## Data layer (`lib/catalog.ts`)

```typescript
ProductSuggestion = { id: string; name: string; price: string; salePrice: string | null }
suggestProducts(query: { q?: string; limit?: number }, opts: CatalogOptions): Promise<ProductSuggestion[]>
```
- Builds `${baseUrl}/products/suggest${toQuery({ q, limit })}`, `cache: 'no-store'`, parses the
  bare array, throws `CatalogError` on non-2xx. Reuses `toQuery`/`CatalogError`/`messageFrom`.
- No env-wrapper — the route handler injects `baseUrl` via its `route-deps` (like cart/orders).

## Route handler (`app/api/products/suggest/`)

- `route.ts`: `export async function GET(req)` → `handleSuggest(req, routeDeps)`.
- `handlers.ts`: `handleSuggest(req, { suggest })` reads `q`/`limit` from `req.nextUrl.searchParams`;
  blank/`<2`-char/absent `q` → return `NextResponse.json([])` WITHOUT calling `suggest`; otherwise
  `suggest({ q, limit })` → `NextResponse.json(result)`. On any thrown error → `NextResponse.json([])`
  (200) and log server-side (autocomplete degrades silently; must never break the page).
- `route-deps.ts`: `suggest = (query) => suggestProducts(query, { baseUrl: process.env.API_URL! })`
  — the injectable seam for `handlers.test.ts`.

## `SearchAutocomplete` client component

`"use client"` combobox encapsulating all interactivity:
- **Form + input:** `<form>` + text `<input>`; submit → `router.push('/products?search=' + encodeURIComponent(term))` (`next/navigation` `useRouter`).
- **Debounced suggest:** on change, `term.trim().length >= 2` → ~250ms debounce → `fetch('/api/products/suggest?q=' + encodeURIComponent(term) + '&limit=8')`. `<2` → clear/close. Stale-response guard (AbortController or latest-query check) so out-of-order responses can't clobber newer.
- **Dropdown:** suggestions show name + effective price (`salePrice ?? price`); select → `/products/[id]`. Closes on select / Esc / click-outside / blur (small delay so option clicks register).
- **Keyboard / ARIA:** `role="combobox"` input + `aria-expanded`/`aria-controls`/`aria-activedescendant`; `role="listbox"`/`role="option"`/`aria-selected`. ↓/↑ move active option, Enter selects active (→ product) or, if none active, submits term → `/products?search=`. Esc closes, keeps focus.
- **No fetch on mount/SSR** (dropdown closed initially) → no hydration mismatch.
- Tailwind DESIGN.md tokens only; visible focus states; keyboard + screen-reader navigable.

## Error / edge handling

- Suggest fetch fails → handler returns `[]` (200); client shows no dropdown; typing + Enter→`/products?search=` still work.
- `<2` chars / whitespace-only / empty → no fetch, no dropdown.
- Out-of-order responses → stale-guard.
- `encodeURIComponent` on the term in both the suggest URL and the `/products?search=` navigation.
- No fetch on mount/SSR → no hydration mismatch.

## Testing

**Unit (Vitest + RTL, mocked):**
- `suggestProducts` (`catalog.test.ts`): builds `/products/suggest?q=&limit=` URL; parses `ProductSuggestion[]`; `CatalogError` on non-2xx (mock fetch).
- Route handler (`app/api/products/suggest/handlers.test.ts`, mirrors cart/orders handler tests): `?q=phone` → calls injected `suggest`, returns the array; blank/short `q` → `[]` without calling `suggest`; injected `suggest` throwing → `[]` (200), no throw.
- `SearchAutocomplete` (`SearchAutocomplete.test.tsx`): fake timers + mocked global `fetch` + mocked `useRouter`: debounced fetch fires only after delay + only at ≥2 chars; suggestions render (name+price); ↓/↑ active-option, Enter on active → `router.push('/products/<id>')`; Enter none-active → `router.push('/products?search=<term>')`; Esc closes; error → no dropdown, no crash; ARIA roles/attrs present.

**Browser smoke (RULE.md §5):** API + storefront vs `ecom_dev` — type "aur" → Aurora suggestions; ↓+Enter → product detail; type+Enter (no pick) → `/products?search=…` (4a page). A failed/slow suggest doesn't block navigation.

**Verification gate:** Vitest suite green (228 existing + new), `npm run lint` clean, `npm run build` succeeds, browser smoke passes vs `ecom_dev`.

## Acceptance criteria

- Header shows a search box; typing ≥2 chars shows a debounced dropdown of product suggestions (name + price) linking to product detail.
- Enter/submit (no suggestion picked) navigates to `/products?search=<term>` (the slice-4a faceted page).
- Full keyboard navigation (↓/↑/Enter/Esc) + ARIA combobox; click-outside closes; visible focus.
- `API_URL` stays server-only (client → Next route handler → API).
- A failed/slow suggest never blocks search or breaks the page.
- All existing storefront tests still green; new units cover data layer, handler, and component.

## Risks

- **Debounce/stale-response races** → AbortController/latest-query guard; unit-tested with fake timers.
- **Hydration mismatch** → no fetch/open-dropdown on mount; client-only state.
- **A11y combobox correctness** → ARIA roles + keyboard nav unit-tested; browser-smoke with keyboard.
- **`search=` contract** → submit navigates to `/products?search=` (the page param, NOT `q=`), per the slice-4a final-review note.
