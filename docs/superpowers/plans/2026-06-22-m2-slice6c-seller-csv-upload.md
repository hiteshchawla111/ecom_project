# M2 Slice 6c — Seller CSV Upload UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a seller bulk-upload products from a CSV file in the portal — a file-picker that POSTs to `/seller/products/import` (multipart) and renders the per-row result report (`created` / `failed` / per-row `errors`), reachable from the My Products page.

**Architecture:** `apps/admin`. Fix `apiClient` so a `FormData` body isn't forced to `Content-Type: application/json` (the browser must set the multipart boundary itself) — a one-line guard. Add `importSellerProducts(file): Promise<ImportResult>` to `lib/sellerProducts.ts` (posts a `FormData` with field `file`). A new `SellerProductImportPage` at `/seller/products/import` renders a file input + submit + the `ImportResult` report (created count, failed count, an errors table of row/sku/message). Link to it from `SellerProductsPage` ("Import CSV" next to "Add product").

**Tech Stack:** React 18 + Vite + TS (strict), react-router-dom, Vitest + RTL. Consumes the slice-4 `POST /seller/products/import` (multipart `file`, returns `ImportResult { created, failed, productIds, errors: { row, sku?, message }[] }`).

## Global Constraints

- Seller-scoped + under `SellerOnlyRoute` — UX-only gating; the API enforces seller scoping + `SellerApprovedGuard` + the size/row caps (1 MiB, 500 rows). Created products are seller-owned server-side (the file's `sellerId`, if any, is ignored — proven in slice 4).
- Reuse the merged UI's semantic surface tokens; **no hardcoded hex**. Match the admin/seller page structure (header, error banner, semantic tokens). Accessible: the file input has a real `<label>`; the result report uses a semantic table; success/error states are not color-only (pair with text).
- Strict TypeScript, no `any`. Functional components + hooks.
- `apiClient` change must be minimal + not regress JSON requests: only skip the forced `Content-Type` when the body is `FormData` (browser sets `multipart/form-data; boundary=…`). All existing JSON calls keep the `application/json` default.
- Admin commands: `npm test`, `npm run lint`, `npm run build` (tsc+vite — real type gate). Runtime smoke: real CSV upload to `/seller/products/import` as the seeded seller (no Playwright — component tests + integration smoke + user click-through).
- No `git push` without explicit permission (RULE.md §3). Branch: `feat/seller-system`.
- The `.claude/worktrees/improvment-UI` worktree is an active other-agent worktree (merged to main) — ignore; never touch.

## File Structure

- `apps/admin/src/lib/apiClient.ts` (modify) — `buildHeaders`: don't set `Content-Type: application/json` when `init.body instanceof FormData`.
- `apps/admin/src/lib/apiClient.test.ts` (modify) — add a test: a `FormData` body does NOT get a forced `application/json` Content-Type (and a normal JSON body still does).
- `apps/admin/src/lib/sellerProducts.ts` (modify) — add `ImportResult`/`RowError` types (mirror the API) + `importSellerProducts(file: File): Promise<ImportResult>`.
- `apps/admin/src/lib/sellerProducts.test.ts` (modify) — test `importSellerProducts` posts a FormData with field `file` to `/seller/products/import`.
- `apps/admin/src/pages/SellerProductImportPage.tsx` (new) + `.test.tsx` — the upload page + result report.
- `apps/admin/src/pages/SellerProductsPage.tsx` (modify) — add an "Import CSV" link to `/seller/products/import` (next to "Add product").
- `apps/admin/src/pages/SellerProductsPage.test.tsx` (modify) — assert the "Import CSV" link href.
- `apps/admin/src/router.tsx` (modify) — add `seller/products/import` → `SellerProductImportPage` under `SellerOnlyRoute`.

---

### Task 1: Let `apiClient` send `FormData` (don't force JSON Content-Type)

**Files:**
- Modify: `apps/admin/src/lib/apiClient.ts`
- Modify: `apps/admin/src/lib/apiClient.test.ts`

**Interfaces:**
- Produces: `apiClient.request` with a `FormData` body sends NO `Content-Type` header (the browser sets `multipart/form-data; boundary=…`); a non-FormData body with no explicit Content-Type still defaults to `application/json`.

- [ ] **Step 1: Add the failing test**

In `apps/admin/src/lib/apiClient.test.ts` (read it for how `fetch` is mocked — it likely stubs global `fetch`), add:

```ts
it('does not force application/json for a FormData body (lets the browser set multipart)', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  // a token may be needed depending on the suite's setup; mirror existing tests
  const fd = new FormData();
  fd.append('file', new Blob(['x'], { type: 'text/csv' }), 'p.csv');

  await apiClient.request('/seller/products/import', { method: 'POST', body: fd });

  const init = fetchMock.mock.calls[0][1] as RequestInit;
  const headers = new Headers(init.headers);
  expect(headers.has('Content-Type')).toBe(false);
});

it('still defaults a non-FormData body to application/json', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({}), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);

  await apiClient.request('/x', { method: 'POST', body: JSON.stringify({ a: 1 }) });

  const init = fetchMock.mock.calls[0][1] as RequestInit;
  const headers = new Headers(init.headers);
  expect(headers.get('Content-Type')).toBe('application/json');
});
```

(Match the existing test file's `fetch`-stubbing + token-store setup. If the suite uses a different mock style, mirror it. The assertion that matters: FormData → no Content-Type; JSON → application/json.)

- [ ] **Step 2: Run — verify the FormData test fails**

Run: `cd apps/admin && npm test -- apiClient`
Expected: FAIL — the FormData body currently gets `application/json` forced (the `buildHeaders` guard only checks `!headers.has('Content-Type')`).

- [ ] **Step 3: Guard `buildHeaders` against FormData**

In `apps/admin/src/lib/apiClient.ts`, change `buildHeaders`:

```ts
function buildHeaders(accessToken: string | undefined, init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  // Don't force application/json for FormData — the browser must set
  // `multipart/form-data; boundary=…` itself (a manual Content-Type breaks parsing).
  if (
    init?.body &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return headers;
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `cd apps/admin && npm test -- apiClient`
Expected: PASS (the new two + all existing apiClient tests).

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/apiClient.ts apps/admin/src/lib/apiClient.test.ts
git commit -m "feat(admin): apiClient sends FormData without forcing JSON Content-Type"
```

---

### Task 2: `importSellerProducts` client + `ImportResult` types

**Files:**
- Modify: `apps/admin/src/lib/sellerProducts.ts`
- Modify: `apps/admin/src/lib/sellerProducts.test.ts`

**Interfaces:**
- Consumes: `apiClient` (Task 1, now FormData-capable).
- Produces:
  - `interface RowError { row: number; sku?: string; message: string }`
  - `interface ImportResult { created: number; failed: number; productIds: string[]; errors: RowError[] }`
  - `importSellerProducts(file: File): Promise<ImportResult>` — builds a `FormData` with field `file`, POSTs to `/seller/products/import`.

- [ ] **Step 1: Add the failing test**

In `apps/admin/src/lib/sellerProducts.test.ts`, add:

```ts
import { importSellerProducts } from './sellerProducts';

describe('importSellerProducts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POSTs a FormData (field "file") to /seller/products/import', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      created: 2, failed: 0, productIds: ['a', 'b'], errors: [],
    });
    const file = new File(['name,sku\nX,X1'], 'p.csv', { type: 'text/csv' });

    const res = await importSellerProducts(file);

    expect(apiClient.request).toHaveBeenCalledTimes(1);
    const [path, init] = (apiClient.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe('/seller/products/import');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
    expect(((init as RequestInit).body as FormData).get('file')).toBe(file);
    expect(res.created).toBe(2);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- sellerProducts`
Expected: FAIL — `importSellerProducts` not exported.

- [ ] **Step 3: Implement the types + function**

In `apps/admin/src/lib/sellerProducts.ts`, add:

```ts
/** One failed row in a bulk import (mirrors the API RowError). */
export interface RowError {
  row: number;
  sku?: string;
  message: string;
}

/** Result of a bulk product import (mirrors the API ImportResult). */
export interface ImportResult {
  created: number;
  failed: number;
  productIds: string[];
  errors: RowError[];
}

/** Upload a CSV of products for the acting seller (multipart, field "file"). */
export function importSellerProducts(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  return apiClient.request<ImportResult>('/seller/products/import', {
    method: 'POST',
    body: form,
  });
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `cd apps/admin && npm test -- sellerProducts`
Expected: PASS (existing + the new import test).

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/sellerProducts.ts apps/admin/src/lib/sellerProducts.test.ts
git commit -m "feat(admin): importSellerProducts client (multipart CSV) + ImportResult types"
```

---

### Task 3: SellerProductImportPage (file picker + result report)

**Files:**
- Create: `apps/admin/src/pages/SellerProductImportPage.tsx`
- Create: `apps/admin/src/pages/SellerProductImportPage.test.tsx`

**Interfaces:**
- Consumes: `importSellerProducts`, `ImportResult` (Task 2).
- Produces: `SellerProductImportPage` — a labelled file input (`accept=".csv,text/csv"`), an "Upload" button (disabled until a file is chosen + while uploading), and on success the `ImportResult` report: a summary ("N created, M failed") + an errors table (row / SKU / message) when `errors.length > 0`. On request failure (e.g. 400 oversized/too-many-rows from the API, surfaced as `ApiError`), an error banner. A back link to `/seller/products`.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/pages/SellerProductImportPage.test.tsx` (mock `../lib/sellerProducts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SellerProductImportPage } from './SellerProductImportPage';

const importSellerProducts = vi.fn();
vi.mock('../lib/sellerProducts', () => ({
  importSellerProducts: (f: File) => importSellerProducts(f),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SellerProductImportPage />
    </MemoryRouter>,
  );
}

const pickFile = () => {
  const input = screen.getByLabelText(/csv file/i) as HTMLInputElement;
  const file = new File(['name,sku\nX,X1'], 'p.csv', { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
};

describe('SellerProductImportPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads the chosen file and shows the result summary', async () => {
    importSellerProducts.mockResolvedValue({
      created: 2, failed: 1, productIds: ['a', 'b'],
      errors: [{ row: 3, sku: 'BAD', message: 'name must be longer' }],
    });
    renderPage();
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));

    await waitFor(() => expect(importSellerProducts).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/2 created/i)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/i)).toBeInTheDocument();
    // error row surfaced
    expect(screen.getByText(/name must be longer/i)).toBeInTheDocument();
    expect(screen.getByText('BAD')).toBeInTheDocument();
  });

  it('disables upload until a file is chosen', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /upload/i })).toBeDisabled();
  });

  it('shows an error banner when the upload request fails', async () => {
    importSellerProducts.mockRejectedValue(new Error('Request failed (400)'));
    renderPage();
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- SellerProductImportPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the page**

Create `apps/admin/src/pages/SellerProductImportPage.tsx`. Follow the seller/admin page structure (header, semantic tokens, error banner pattern). Manage: `file` state (from the input), `uploading`, `result: ImportResult | null`, `error: string | null`.

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { importSellerProducts, type ImportResult } from '../lib/sellerProducts';

export function SellerProductImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const res = await importSellerProducts(file);
      setResult(res);
    } catch {
      setError('The upload could not be completed. Check the file and try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link to="/seller/products" className="text-sm text-content-muted hover:text-content">
          ← Back to products
        </Link>
        <h2 className="font-heading text-2xl font-semibold text-content">
          Import products from CSV
        </h2>
        <p className="text-content-muted">
          Columns: name, sku, description, price, categoryId (optional: salePrice, brand, status).
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <label htmlFor="csv-file" className="text-sm font-medium text-content">
          CSV file
        </label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
          }}
          className="text-sm text-content-muted"
        />
        <div>
          <button
            type="button"
            disabled={!file || uploading}
            onClick={() => void onUpload()}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-content">
            <span className="font-medium text-success-600">{result.created} created</span>
            {', '}
            <span className={result.failed > 0 ? 'font-medium text-error-500' : 'text-content-muted'}>
              {result.failed} failed
            </span>
            .
          </p>
          {result.errors.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted text-content-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Row</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">SKU</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e) => (
                    <tr key={`${e.row}-${e.sku ?? ''}`} className="border-t border-line text-content">
                      <td className="px-4 py-2">{e.row}</td>
                      <td className="px-4 py-2 text-content-muted">{e.sku ?? '—'}</td>
                      <td className="px-4 py-2">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

(Confirm `text-success-600` / `text-error-500` exist as semantic tokens in the admin Tailwind theme — the admin pages use `text-error-500`; check for a success token (the merged UI redesign added semantic tokens). If no success token exists, use `text-content` for the created count and rely on the text label, never color-only. Match whatever the codebase already uses for positive/negative states.)

- [ ] **Step 4: Run — verify it passes**

Run: `cd apps/admin && npm test -- SellerProductImportPage`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/pages/SellerProductImportPage.tsx apps/admin/src/pages/SellerProductImportPage.test.tsx
git commit -m "feat(admin): SellerProductImportPage — CSV upload + per-row result report"
```

---

### Task 4: Link from SellerProductsPage + wire the route

**Files:**
- Modify: `apps/admin/src/pages/SellerProductsPage.tsx`
- Modify: `apps/admin/src/pages/SellerProductsPage.test.tsx`
- Modify: `apps/admin/src/router.tsx`

**Interfaces:**
- Consumes: `SellerProductImportPage` (Task 3).
- Produces: an "Import CSV" link on `SellerProductsPage` → `/seller/products/import`; the route `seller/products/import` → `SellerProductImportPage` under `SellerOnlyRoute`.

- [ ] **Step 1: Add the link-href test**

In `apps/admin/src/pages/SellerProductsPage.test.tsx`, add an assertion that an "Import CSV" link points to `/seller/products/import` (mirror the existing "Add product" link assertion).

```ts
it('links to the CSV import page', async () => {
  // render with at least one product (or empty — the link is in the header, always shown)
  expect(screen.getByRole('link', { name: /import csv/i })).toHaveAttribute(
    'href',
    '/seller/products/import',
  );
});
```

(Place it where the header renders regardless of list state — the header links show even when the list is empty/loading. Match the existing test's render setup.)

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- SellerProductsPage`
Expected: FAIL — no "Import CSV" link yet.

- [ ] **Step 3: Add the link to the header**

In `apps/admin/src/pages/SellerProductsPage.tsx`, in the header (next to "Add product"), add an "Import CSV" `Link`. Wrap the two links in a flex container so they sit together:

```tsx
        <div className="flex items-center gap-2">
          <Link
            to="/seller/products/import"
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            Import CSV
          </Link>
          <Link
            to="/seller/products/new"
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            Add product
          </Link>
        </div>
```

(Keep the existing "Add product" link exactly; just wrap both in the flex div. Match the header's existing layout — the header is `flex items-center justify-between` with the title on the left.)

- [ ] **Step 4: Wire the route**

In `apps/admin/src/router.tsx`, import `SellerProductImportPage` and add to the `SellerOnlyRoute` group:

```tsx
              { path: 'seller/products/import', element: <SellerProductImportPage /> },
```

(Place it among the other `seller/products*` routes. Note: `seller/products/import` and `seller/products/:id/edit` — `import` is a literal single segment after `products`, `:id/edit` is two segments, and `new` is a literal single segment; `import` vs `new` vs `:id` — react-router matches static segments (`import`, `new`) before the dynamic `:id`, so `/seller/products/import` resolves to the import page, not an edit with id="import". Confirm by ordering static routes before the `:id` route if needed, but react-router v6 ranks static above dynamic automatically.)

- [ ] **Step 5: Build + full suite + lint**

Run: `cd apps/admin && npm run build && npm test && npm run lint`
Expected: build clean; full suite green; lint clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/pages/SellerProductsPage.tsx apps/admin/src/pages/SellerProductsPage.test.tsx apps/admin/src/router.tsx
git commit -m "feat(admin): link + route the seller CSV import page (/seller/products/import)"
```

---

### Task 5: Sub-slice gate + runtime smoke + tracker

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Full admin gate**

Run from `apps/admin`: `npm test`, `npm run lint`, `npm run build`. From repo root: `git status --porcelain` (clean), `git worktree list` (ignore the `improvment-UI` other-agent worktree).
Expected: all green.

- [ ] **Step 2: Runtime integration smoke**

Boot API (`:5000`) + admin (`:5002`); seed. As the seeded seller, exercise the real import endpoint with `curl -F`:
- A small CSV with 2 valid rows (use a public category id from `GET /categories`) + 1 invalid (empty name) → `{ created: 2, failed: 1, errors: [1 entry] }`.
- Confirm the created products appear in `GET /seller/products` as the seller; clean them up.
- (Optional) an oversized/too-many-rows file → 400.
Report the statuses + the report body. (Browser pixels = user click-through per the agreed approach.)

- [ ] **Step 3: Update tracker**

In `docs/IMPLEMENTATION_PLAN.md`, append to the M2 row: "6c CSV upload (`/seller/products/import` page — file picker + per-row result report; apiClient FormData fix) done; next: 6d My Inventory."

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m2): mark slice 6c (seller CSV upload) done"
```

- [ ] **Step 5: STOP and ask the user to verify (RULE.md §1)**

Summarize; suggest the user click-through (seller → My Products → Import CSV → upload a file → see the report). Note 6d (My Inventory) is next. Do not push.

---

## Self-Review

**Spec coverage (against `2026-06-22-m2-slice6-admin-seller-portal-ui-design.md` §6c):**
- File-picker upload to `POST /seller/products/import` → Tasks 2 (client), 3 (page). ✓
- Per-row result report (created/failed/errors) → Task 3 (summary + errors table). ✓
- Reachable from the products page → Task 4 ("Import CSV" link + route). ✓
- Multipart works (the real blocker) → Task 1 (`apiClient` FormData fix). ✓
- Seller-owned, size/row caps → enforced server-side (slice 4); the UI surfaces the report + a 400 error banner. ✓

**Placeholder scan:** No TBD/TODO. Task 3 flags one verify-against-codebase point (does a `text-success-*` token exist? — with an explicit fallback to text-only, never color-only) — a concrete instruction honoring the no-color-only a11y rule, not vagueness. The page/client code is given in full.

**Type consistency:** `ImportResult`/`RowError` (Task 2) mirror the API DTO exactly and are consumed by the page (Task 3). `importSellerProducts(file: File): Promise<ImportResult>` consumed in Task 3. The `apiClient` FormData guard (Task 1) is what makes `importSellerProducts`'s FormData body work — Task 2 depends on Task 1. Route + link (Task 4) reference `SellerProductImportPage` (Task 3).

**Note on the apiClient change:** it's the one piece touching shared infra (every request flows through `buildHeaders`). The guard is additive (only changes behavior for FormData bodies, which nothing else sends today), and Task 1's second test locks the JSON default so the change can't regress existing requests.
