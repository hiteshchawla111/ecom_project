# M2 Slice 6a — Seller Portal Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit the `SELLER` role into the admin app, route it to a seller-only `/seller` subtree with a role-branched shell nav and a minimal seller Dashboard, back it with seller-scoped API clients, and seed a stable ACTIVE dev seller — the foundation every later seller-portal sub-slice (6b–6e) builds on.

**Architecture:** `apps/admin` (React + Vite + TS). Add `'SELLER'` to the `Role` union; admit SELLER through `ProtectedRoute` (via `roles.ts`); add a `SellerOnlyRoute` (mirrors `AdminOnlyRoute`) gating `/seller/*`; branch `AppShell` nav on `role === 'SELLER'`; add a seller `DashboardPage` mirroring the admin one's honest-placeholder style. Seller data comes from new `lib/sellerProducts.ts` (+ a stub `lib/sellerInventory.ts`) hitting `/seller/*`. Separately, extend `apps/api/prisma/seed.ts` (idempotent) with a dev seller account.

**Tech Stack:** React 18 + Vite + TypeScript (strict), react-router-dom (`createBrowserRouter`), Vitest + RTL (co-located `*.test.tsx`), Tailwind v4 semantic surface tokens. Backend: Prisma 7 seed.

## Global Constraints

- All role-gating in the admin app is **UX-only** — the API enforces the real boundary (`apps/admin/CLAUDE.md`). Render the right thing + redirect; never gate sensitive data on the client.
- Reuse the merged UI redesign: semantic surface tokens (`bg-surface`/`-sunk`/`-muted`, `text-content`/`-muted`/`-subtle`, `border-line`, `primary-*`), the redesigned `AppShell`, `components/ui/*` (`StatCard`, `ThemeToggle`), dark mode. **No hardcoded hex** (`DESIGN.md`).
- Strict TypeScript, no `any`. Functional components + hooks (`~/.claude` React prefs).
- Accessibility: semantic HTML, keyboard nav, focus states, WCAG-AA contrast; nav active-state not color-only (the existing `navLinkClass` already does border+tint+weight — reuse it).
- Admin/inventory-manager experience must be **unchanged** — branch additively, don't rewrite the existing nav.
- Admin app commands: `npm run dev` (:5002), `npm test` (vitest run), `npm run build` (tsc+vite), `npm run lint`. API seed: `npx prisma db seed` (idempotent; DB `ecom_dev`, user `sotsys033`, no password; never touch `ecomm`).
- Verify the admin build with `npm run build` (tsc+vite — this app's build DOES fail on tsc errors, unlike the API's `nest build`). Browser-smoke on `:5002` against the API on `:5000`.
- No `git push` without explicit permission (RULE.md §3). Branch: `feat/seller-system` (in place, pushed/rebased on main).
- The `.claude/worktrees/improvment-UI` worktree is an active other-agent worktree (its work is already merged to main) — ignore it; never touch it.
- Dev seller (Task 1): `seller@example.com` / `Password123!`, role `SELLER`, Seller `{ slug: 'demo-shop', displayName: 'Demo Shop', status: ACTIVE }`, owning 2 products + inventory.

## File Structure

- `apps/api/prisma/seed.ts` (modify) — add the idempotent dev seller (user + Seller + 2 owned products + inventory).
- `apps/admin/src/lib/types.ts` (modify) — `Role` union gains `'SELLER'`.
- `apps/admin/src/auth/roles.ts` (modify) — admit SELLER into the shell (`isInternalRole` stays for the *internal* nav branch; add an explicit "allowed into shell" notion).
- `apps/admin/src/auth/SellerOnlyRoute.tsx` (new) + `.test.tsx` — gate `/seller/*` to `role === 'SELLER'`.
- `apps/admin/src/lib/sellerProducts.ts` (new) + `.test.ts` — `/seller/products` client (list now; create/update/etc. arrive in 6b).
- `apps/admin/src/lib/sellerInventory.ts` (new) — minimal `/seller/inventory` client stub (list) for the dashboard low-stock metric; fleshed out in 6d.
- `apps/admin/src/pages/SellerDashboardPage.tsx` (new) + `.test.tsx` — seller landing with honest placeholders.
- `apps/admin/src/components/AppShell.tsx` (modify) + a new `AppShell.seller.test.tsx` — role-branched nav + wordmark.
- `apps/admin/src/router.tsx` (modify) — `/seller` subtree under `SellerOnlyRoute`.

---

### Task 1: Seed a stable ACTIVE dev seller (backend)

**Files:**
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Produces: a dev login `seller@example.com` / `Password123!` (role `SELLER`) with a Seller `{ slug: 'demo-shop', displayName: 'Demo Shop', status: ACTIVE }` owning 2 products + inventory. Idempotent (upsert on email / userId; products via findFirst-guard scoped to the demo seller).

- [ ] **Step 1: Add the dev seller to the seed**

In `apps/api/prisma/seed.ts`, the seed already creates dev users (admin, inventory) and the Platform Seller, and seeds products under the platform seller. After the Platform Seller block, add a demo seller. Reuse the existing `passwordHash` (bcrypt of `Password123!`) already computed in the seed.

```ts
  // Demo seller — a self-serve SELLER account for the seller portal (M2 slice 6).
  const sellerUser = await prisma.user.upsert({
    where: { email: 'seller@example.com' },
    update: {},
    create: {
      email: 'seller@example.com',
      name: 'Demo Seller',
      role: Role.SELLER,
      passwordHash,
    },
  });
  const demoSeller = await prisma.seller.upsert({
    where: { userId: sellerUser.id },
    update: {},
    create: {
      userId: sellerUser.id,
      displayName: 'Demo Shop',
      slug: 'demo-shop',
      status: SellerStatus.ACTIVE,
    },
  });

  // A couple of products owned by the demo seller (idempotent: findFirst-guarded
  // create scoped to this seller, mirroring the platform-seller product loop).
  const demoProducts = [
    { sku: 'DEMO-001', name: 'Demo Mug', description: 'A sturdy ceramic mug.', price: '12.00', available: 30, lowStockThreshold: 5 },
    { sku: 'DEMO-002', name: 'Demo Notebook', description: 'A5 dotted notebook.', price: '8.50', available: 3, lowStockThreshold: 5 },
  ];
  for (const p of demoProducts) {
    let product = await prisma.product.findFirst({
      where: { sku: p.sku, sellerId: demoSeller.id },
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          sku: p.sku,
          name: p.name,
          description: p.description,
          price: p.price,
          status: ProductStatus.ACTIVE,
          categoryId: phones.id,
          sellerId: demoSeller.id,
        },
      });
    }
    const invCount = await prisma.inventoryItem.count({
      where: { productId: product.id },
    });
    if (invCount === 0) {
      await prisma.inventoryItem.create({
        data: {
          productId: product.id,
          available: p.available,
          reserved: 0,
          lowStockThreshold: p.lowStockThreshold,
          sellerId: demoSeller.id,
        },
      });
    }
  }
```

(`Role`, `SellerStatus`, `ProductStatus` are already imported in seed.ts; `phones` is the seeded category in scope. Use `phones.id` for `categoryId` — it exists in the seed. If `phones` is not in scope at this point in the file, use any seeded category id, e.g. re-fetch `await prisma.category.findFirstOrThrow({ where: { slug: 'phones' } })`.)

- [ ] **Step 2: Run the seed (idempotent) against `ecom_dev`**

Run: `cd apps/api && npx prisma db seed`
Expected: "Seed complete." No error.

- [ ] **Step 3: Verify the dev seller exists + is ACTIVE + owns 2 products**

Run:
```bash
psql ecom_dev -tc "SELECT u.email, u.role, s.slug, s.status FROM \"User\" u JOIN \"Seller\" s ON s.\"userId\"=u.id WHERE u.email='seller@example.com';"
psql ecom_dev -tc "SELECT count(*) FROM \"Product\" p JOIN \"Seller\" s ON s.id=p.\"sellerId\" WHERE s.slug='demo-shop';"
```
Expected: one row `seller@example.com | SELLER | demo-shop | ACTIVE`; product count `2`.

- [ ] **Step 4: Confirm idempotency — re-run the seed**

Run: `cd apps/api && npx prisma db seed`
Then re-run the product-count query.
Expected: still `2` (no duplicates).

- [ ] **Step 5: Verify the seed compiles + login works over HTTP**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit` → 0 errors.
Boot `npm run start:dev`; poll `localhost:5000/products` for 200; then:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:5000/auth/login -H 'Content-Type: application/json' -d '{"email":"seller@example.com","password":"Password123!"}'
```
Expected: `201` (or 200 — whatever `/auth/login` returns for the existing dev users; match that). Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat(m2): seed a stable ACTIVE demo seller (seller@example.com) for the portal"
```

---

### Task 2: Add `SELLER` to the Role union + admit into the shell

**Files:**
- Modify: `apps/admin/src/lib/types.ts`
- Modify: `apps/admin/src/auth/roles.ts`
- Modify: `apps/admin/src/auth/roles.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Role` includes `'SELLER'`. `isInternalRole(role)` is unchanged (still `ADMIN`/`INVENTORY_MANAGER` only — used for the *internal* nav branch). New `canEnterShell(role): boolean` returns true for `ADMIN`, `INVENTORY_MANAGER`, and `SELLER` (used by `ProtectedRoute` to admit). CUSTOMER stays rejected.

- [ ] **Step 1: Write the failing test for `canEnterShell`**

In `apps/admin/src/auth/roles.test.ts`, add (alongside the existing `isInternalRole` tests):

```ts
import { isInternalRole, canEnterShell } from './roles';
// ...existing isInternalRole tests stay...

describe('canEnterShell', () => {
  it('admits ADMIN, INVENTORY_MANAGER and SELLER', () => {
    expect(canEnterShell('ADMIN')).toBe(true);
    expect(canEnterShell('INVENTORY_MANAGER')).toBe(true);
    expect(canEnterShell('SELLER')).toBe(true);
  });
  it('rejects CUSTOMER', () => {
    expect(canEnterShell('CUSTOMER')).toBe(false);
  });
});

describe('isInternalRole (unchanged — SELLER is not internal)', () => {
  it('does not treat SELLER as internal', () => {
    expect(isInternalRole('SELLER')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- roles`
Expected: FAIL — `canEnterShell` not exported; and `isInternalRole('SELLER')` won't type-check until `Role` has `'SELLER'`.

- [ ] **Step 3: Add `'SELLER'` to the Role union**

In `apps/admin/src/lib/types.ts`, change:

```ts
export type Role = 'CUSTOMER' | 'ADMIN' | 'INVENTORY_MANAGER';
```

to:

```ts
export type Role = 'CUSTOMER' | 'ADMIN' | 'INVENTORY_MANAGER' | 'SELLER';
```

- [ ] **Step 4: Add `canEnterShell` to roles.ts**

In `apps/admin/src/auth/roles.ts`, keep `isInternalRole` as-is and add:

```ts
/** Roles permitted into the admin/seller shell at all. CUSTOMER is rejected. */
const SHELL_ROLES: ReadonlySet<Role> = new Set<Role>([
  'ADMIN',
  'INVENTORY_MANAGER',
  'SELLER',
]);

export function canEnterShell(role: Role): boolean {
  return SHELL_ROLES.has(role);
}
```

- [ ] **Step 5: Run — verify it passes**

Run: `cd apps/admin && npm test -- roles`
Expected: PASS.

- [ ] **Step 6: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean. (`build` runs tsc — confirms the `Role` widening didn't break exhaustiveness anywhere; if a `switch (role)` elsewhere now lacks a `SELLER` case and relies on exhaustiveness, fix it. Expect none in 6a's scope, but the build will tell you.)

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/types.ts apps/admin/src/auth/roles.ts apps/admin/src/auth/roles.test.ts
git commit -m "feat(admin): add SELLER role + canEnterShell (admit seller into the shell)"
```

---

### Task 3: Admit SELLER through ProtectedRoute

**Files:**
- Modify: `apps/admin/src/auth/ProtectedRoute.tsx`
- Modify: `apps/admin/src/auth/ProtectedRoute.test.tsx`

**Interfaces:**
- Consumes: `canEnterShell` (Task 2).
- Produces: `ProtectedRoute` admits any shell role (incl. SELLER); CUSTOMER → `AccessDeniedPage`; guest → redirect to `/login`.

- [ ] **Step 1: Add the failing test**

In `apps/admin/src/auth/ProtectedRoute.test.tsx` (read it first for the mock/render pattern — it mocks `useAuth`), add cases: a SELLER is admitted (renders the protected outlet, not AccessDenied), and a CUSTOMER still hits AccessDenied. Mirror the existing tests' structure exactly. Example assertion shape (adapt to the file's helpers):

```ts
it('admits a SELLER into the shell', () => {
  // mock useAuth -> { status:'authed', user:{ role:'SELLER', ... } }
  // render ProtectedRoute with a child route rendering e.g. <div>OUTLET</div>
  expect(screen.getByText('OUTLET')).toBeInTheDocument();
});

it('rejects a CUSTOMER with AccessDenied', () => {
  // mock useAuth -> { status:'authed', user:{ role:'CUSTOMER', ... } }
  // AccessDeniedPage renders some known text — assert it; assert OUTLET absent
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- ProtectedRoute`
Expected: FAIL — SELLER currently hits AccessDenied (because `isInternalRole('SELLER')` is false).

- [ ] **Step 3: Switch ProtectedRoute to `canEnterShell`**

In `apps/admin/src/auth/ProtectedRoute.tsx`, change the import and the gate:

```ts
import { canEnterShell } from './roles';
// ...
  // UX-only gate — the API enforces real authorization on every request.
  if (!canEnterShell(user.role)) {
    return <AccessDeniedPage />;
  }
```

(Remove the now-unused `isInternalRole` import from this file if it's no longer referenced here.)

- [ ] **Step 4: Run — verify it passes**

Run: `cd apps/admin && npm test -- ProtectedRoute`
Expected: PASS (incl. existing guest/loading tests).

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/auth/ProtectedRoute.tsx apps/admin/src/auth/ProtectedRoute.test.tsx
git commit -m "feat(admin): ProtectedRoute admits SELLER via canEnterShell"
```

---

### Task 4: SellerOnlyRoute gate

**Files:**
- Create: `apps/admin/src/auth/SellerOnlyRoute.tsx`
- Create: `apps/admin/src/auth/SellerOnlyRoute.test.tsx`

**Interfaces:**
- Consumes: `useAuth`.
- Produces: `SellerOnlyRoute` component — renders `<Outlet />` when `role === 'SELLER'`, else `<AccessDeniedPage />`. Mirrors `AdminOnlyRoute`.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/auth/SellerOnlyRoute.test.tsx` (mirror `AdminOnlyRoute.test.tsx` — read it for the exact mock+router pattern):

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { SellerOnlyRoute } from './SellerOnlyRoute';

const mockUseAuth = vi.fn();
vi.mock('./AuthContext', () => ({ useAuth: () => mockUseAuth() }));

function renderGate() {
  const router = createMemoryRouter(
    [
      {
        element: <SellerOnlyRoute />,
        children: [{ path: '/', element: <div>SELLER AREA</div> }],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('SellerOnlyRoute', () => {
  it('renders the outlet for a SELLER', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'SELLER', email: 's@x.co' } });
    renderGate();
    expect(screen.getByText('SELLER AREA')).toBeInTheDocument();
  });

  it('blocks an ADMIN with AccessDenied', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'ADMIN', email: 'a@x.co' } });
    renderGate();
    expect(screen.queryByText('SELLER AREA')).not.toBeInTheDocument();
  });
});
```

(Confirm `AccessDeniedPage`'s rendered text by reading it, if you want a positive assertion on the blocked case; the `queryByText('SELLER AREA')` absence is sufficient.)

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- SellerOnlyRoute`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SellerOnlyRoute**

Create `apps/admin/src/auth/SellerOnlyRoute.tsx`:

```ts
import { Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';

/**
 * Restricts a route subtree to SELLER. Nest inside ProtectedRoute (which admits
 * any shell role); this blocks ADMIN / INVENTORY_MANAGER from the seller portal.
 *
 * UX-only — the API enforces seller scoping + SellerApprovedGuard on every request.
 */
export function SellerOnlyRoute() {
  const { user } = useAuth();
  if (user?.role !== 'SELLER') return <AccessDeniedPage />;
  return <Outlet />;
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `cd apps/admin && npm test -- SellerOnlyRoute`
Expected: PASS.

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/auth/SellerOnlyRoute.tsx apps/admin/src/auth/SellerOnlyRoute.test.tsx
git commit -m "feat(admin): SellerOnlyRoute gate (mirrors AdminOnlyRoute)"
```

---

### Task 5: Seller API clients (`sellerProducts` list + `sellerInventory` stub)

**Files:**
- Create: `apps/admin/src/lib/sellerProducts.ts`
- Create: `apps/admin/src/lib/sellerProducts.test.ts`
- Create: `apps/admin/src/lib/sellerInventory.ts`

**Interfaces:**
- Consumes: `apiClient`, `Product`/`Paginated`/`ListProductsQuery` types (reuse from `./products` — re-export or import).
- Produces:
  - `listSellerProducts(query?: ListProductsQuery): Promise<Paginated<Product>>` → `GET /seller/products`.
  - `listSellerStock(query?: { page?: number; pageSize?: number; lowStock?: boolean }): Promise<Paginated<SellerStockRow>>` → `GET /seller/inventory` (stub: type + call; the dashboard only needs `total` / a low-stock count). `SellerStockRow` mirrors the API stock row (`productId`, `name`, `sku`, `available`, `reserved`, `lowStockThreshold`).

- [ ] **Step 1: Write the failing test for `listSellerProducts`**

Create `apps/admin/src/lib/sellerProducts.test.ts` (mirror `products.test.ts` — read it for how `apiClient.request` is mocked):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from './apiClient';
import { listSellerProducts } from './sellerProducts';

vi.mock('./apiClient', () => ({
  apiClient: { request: vi.fn() },
}));

describe('listSellerProducts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs /seller/products with pagination params', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [], page: 1, pageSize: 20, total: 0, totalPages: 1,
    });
    await listSellerProducts({ page: 2, pageSize: 10 });
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products?page=2&pageSize=10');
  });

  it('GETs /seller/products with no query string when no params', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [], page: 1, pageSize: 20, total: 0, totalPages: 1,
    });
    await listSellerProducts();
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products');
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- sellerProducts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `sellerProducts.ts`**

Create `apps/admin/src/lib/sellerProducts.ts`. Reuse the `Product`/`Paginated`/`ListProductsQuery` types and the `toQuery` helper pattern from `./products` (import the types; re-implement `toQuery` locally or export it from `./products` and import — prefer importing the types and a small local `toQuery` to avoid widening `products.ts`'s public surface unless it already exports `toQuery`; it does not, so keep a local copy — it is 6 lines and DRY-acceptable as the seam differs by endpoint):

```ts
import { apiClient } from './apiClient';
import type { Paginated, Product, ListProductsQuery } from './products';

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** List the acting seller's own products (scoped server-side to the seller). */
export function listSellerProducts(
  query: ListProductsQuery = {},
): Promise<Paginated<Product>> {
  const path = `/seller/products${toQuery({
    page: query.page,
    pageSize: query.pageSize,
  })}`;
  return apiClient.request<Paginated<Product>>(path);
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `cd apps/admin && npm test -- sellerProducts`
Expected: PASS.

- [ ] **Step 5: Implement the `sellerInventory.ts` stub**

Create `apps/admin/src/lib/sellerInventory.ts` (no test required this task — it's a thin typed call exercised via the dashboard test in Task 6; 6d adds its own tests):

```ts
import { apiClient } from './apiClient';
import type { Paginated } from './products';

/** A stock row as returned by GET /seller/inventory (mirrors the API StockRow). */
export interface SellerStockRow {
  productId: string;
  name: string;
  sku: string;
  available: number;
  reserved: number;
  lowStockThreshold: number;
}

export interface ListSellerStockQuery {
  page?: number;
  pageSize?: number;
  lowStock?: boolean;
}

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** List the acting seller's own stock (scoped server-side). */
export function listSellerStock(
  query: ListSellerStockQuery = {},
): Promise<Paginated<SellerStockRow>> {
  const path = `/seller/inventory${toQuery({
    page: query.page,
    pageSize: query.pageSize,
    lowStock: query.lowStock,
  })}`;
  return apiClient.request<Paginated<SellerStockRow>>(path);
}
```

(Confirm the API `GET /seller/inventory` accepts `lowStock` + returns a `Paginated<StockRow>` with those fields — check `ListStockDto` and the `StockRow` shape in `apps/api/src/inventory`. If the field names differ (e.g. `name`/`sku` nested under a relation), match the actual response shape. If `lowStock` isn't a supported query param, drop it from the stub — the dashboard can compute low-stock client-side from the page, or just show a placeholder; keep the stub honest to the real API.)

- [ ] **Step 6: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/sellerProducts.ts apps/admin/src/lib/sellerProducts.test.ts apps/admin/src/lib/sellerInventory.ts
git commit -m "feat(admin): seller API clients (sellerProducts list + sellerInventory stub)"
```

---

### Task 6: Seller DashboardPage

**Files:**
- Create: `apps/admin/src/pages/SellerDashboardPage.tsx`
- Create: `apps/admin/src/pages/SellerDashboardPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth`, `listSellerProducts` (Task 5), `StatCard` (`components/ui/StatCard`).
- Produces: `SellerDashboardPage` — a landing with one honest metric ("My products" = `listSellerProducts({page:1,pageSize:1}).total`) + clearly-labelled placeholders (no fabricated numbers), mirroring the admin `DashboardPage` style.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/pages/SellerDashboardPage.test.tsx` (mirror `DashboardPage.test.tsx` — read it for the mock pattern):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SellerDashboardPage } from './SellerDashboardPage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'seller@example.com', role: 'SELLER' } }),
}));
const listSellerProducts = vi.fn();
vi.mock('../lib/sellerProducts', () => ({
  listSellerProducts: () => listSellerProducts(),
}));

describe('SellerDashboardPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the seller product count from the API', async () => {
    listSellerProducts.mockResolvedValue({ data: [], page: 1, pageSize: 1, total: 7, totalPages: 7 });
    render(<SellerDashboardPage />);
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
    expect(screen.getByText(/my products/i)).toBeInTheDocument();
  });

  it('shows an em dash when the count cannot be loaded (no fabricated number)', async () => {
    listSellerProducts.mockRejectedValue(new Error('down'));
    render(<SellerDashboardPage />);
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0));
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- SellerDashboardPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SellerDashboardPage**

Create `apps/admin/src/pages/SellerDashboardPage.tsx`, modeled on `DashboardPage.tsx` (reuse `StatCard`, the cancellation-guarded effect, semantic tokens). One real metric (My products), the rest honest placeholders:

```tsx
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listSellerProducts } from '../lib/sellerProducts';
import { StatCard } from '../components/ui/StatCard';

export function SellerDashboardPage() {
  const { user } = useAuth();
  const [productCount, setProductCount] = useState<string>('—');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await listSellerProducts({ page: 1, pageSize: 1 });
        if (!cancelled) setProductCount(String(res.total));
      } catch {
        if (!cancelled) setProductCount('—');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-semibold text-content">
          Seller dashboard
        </h2>
        <p className="text-content-muted">Welcome, {user?.email}.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My products" value={productCount} />
        <StatCard label="Low stock" value="—" hint="Coming soon" />
        <StatCard label="Orders" value="—" hint="Coming soon" />
        <StatCard label="Revenue" value="—" hint="Coming soon" />
      </div>
    </section>
  );
}
```

(Check `StatCard`'s props — the admin DashboardPage passes `label`, `value`, optional `hint`, optional `icon`. Icons are optional; omit them here or add small inline svgs like the admin page if `icon` is required. Match the actual `StatCard` signature.)

- [ ] **Step 4: Run — verify it passes**

Run: `cd apps/admin && npm test -- SellerDashboardPage`
Expected: PASS.

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/pages/SellerDashboardPage.tsx apps/admin/src/pages/SellerDashboardPage.test.tsx
git commit -m "feat(admin): seller dashboard page (honest metrics, mirrors admin dashboard)"
```

---

### Task 7: Role-branch the AppShell nav + wordmark

**Files:**
- Modify: `apps/admin/src/components/AppShell.tsx`
- Create: `apps/admin/src/components/AppShell.seller.test.tsx`

**Interfaces:**
- Consumes: `useAuth` (gives `user.role`).
- Produces: when `role === 'SELLER'`, the sidebar shows the seller nav (Dashboard → `/`, My Products → `/seller/products`, My Inventory → `/seller/inventory`) and a seller wordmark ("Seller" / "Seller Portal"); internal roles see today's nav unchanged.

- [ ] **Step 1: Write the failing seller-nav test**

Create `apps/admin/src/components/AppShell.seller.test.tsx` (mirror `AppShell.inventory.test.tsx` — separate file so the SELLER `useAuth` mock doesn't collide):

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from './AppShell';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn().mockResolvedValue(undefined),
    status: 'authed',
    user: { sub: '9', email: 'seller@example.com', role: 'SELLER' },
    login: vi.fn(),
  }),
}));

function renderShell() {
  const router = createMemoryRouter(
    [{ element: <AppShell />, children: [{ path: '/', element: <div>DASH</div> }] }],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('AppShell (SELLER)', () => {
  it('shows the seller nav (Dashboard, My Products, My Inventory)', () => {
    renderShell();
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my products/i })).toHaveAttribute('href', '/seller/products');
    expect(screen.getByRole('link', { name: /my inventory/i })).toHaveAttribute('href', '/seller/inventory');
  });

  it('hides the admin nav from a SELLER', () => {
    renderShell();
    // admin links must not appear for a seller
    expect(screen.queryByRole('link', { name: /^products$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /categories/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /orders/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sellers/i })).not.toBeInTheDocument();
  });
});
```

(Note: the admin nav has a "Products" link and the seller nav has "My Products" — the `name: /^products$/i` anchor avoids matching "My Products". Verify the matcher distinguishes them; adjust if RTL accessible-name matching needs it.)

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- AppShell.seller`
Expected: FAIL — the shell doesn't render seller links yet.

- [ ] **Step 3: Branch the AppShell**

In `apps/admin/src/components/AppShell.tsx`, derive `isSeller` and branch the nav + wordmark. Keep the internal branch (`isAdmin` and the inventory link) exactly as-is for non-sellers. Replace the nav body so a SELLER sees ONLY the seller links:

```tsx
  const { user } = useAuth();
  const isAdmin = user!.role === 'ADMIN';
  const isSeller = user!.role === 'SELLER';
```

Wordmark (the `<h1>` and the mark letter) — make it role-aware:

```tsx
  <span aria-hidden="true" className="...unchanged gradient classes...">
    {isSeller ? 'S' : 'A'}
  </span>
  <h1 className="...unchanged...">{isSeller ? 'Seller' : 'Admin'}</h1>
```

Nav body:

```tsx
        <nav aria-label="Sidebar" className="mt-6 flex flex-col gap-1 text-sm">
          <NavLink to="/" end className={navLinkClass}>
            Dashboard
          </NavLink>

          {isSeller ? (
            <>
              <p className={groupLabelClass}>Catalog</p>
              <NavLink to="/seller/products" className={navLinkClass}>
                My Products
              </NavLink>
              <NavLink to="/seller/inventory" className={navLinkClass}>
                My Inventory
              </NavLink>
            </>
          ) : (
            <>
              {isAdmin && (
                <>
                  <p className={groupLabelClass}>Catalog</p>
                  <NavLink to="/products" className={navLinkClass}>
                    Products
                  </NavLink>
                  <NavLink to="/categories" className={navLinkClass}>
                    Categories
                  </NavLink>
                </>
              )}
              <p className={groupLabelClass}>Operations</p>
              {isAdmin && (
                <>
                  <NavLink to="/orders" className={navLinkClass}>
                    Orders
                  </NavLink>
                  <NavLink to="/sellers" className={navLinkClass}>
                    Sellers
                  </NavLink>
                </>
              )}
              <NavLink to="/inventory" className={navLinkClass}>
                Inventory
              </NavLink>
            </>
          )}
        </nav>
```

(This preserves the exact internal-role nav for ADMIN/INVENTORY_MANAGER — the `else` branch is the current nav verbatim. A SELLER gets only the seller links, no Inventory-admin link.)

- [ ] **Step 4: Run — verify the seller test + the existing shell tests pass**

Run: `cd apps/admin && npm test -- AppShell`
Expected: PASS — `AppShell.seller`, `AppShell.test` (ADMIN), and `AppShell.inventory` (INVENTORY_MANAGER) all green. The existing two must be unaffected (the `else` branch is their unchanged nav).

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/components/AppShell.tsx apps/admin/src/components/AppShell.seller.test.tsx
git commit -m "feat(admin): role-branch AppShell nav + wordmark for SELLER"
```

---

### Task 8: Wire the `/seller` route subtree

**Files:**
- Modify: `apps/admin/src/router.tsx`

**Interfaces:**
- Consumes: `SellerOnlyRoute` (Task 4), `SellerDashboardPage` (Task 6).
- Produces: `/seller` (index → `SellerDashboardPage`) under `SellerOnlyRoute`, inside the shell. Placeholder children for `/seller/products` + `/seller/inventory` are NOT added here (they land in 6b/6d); only the dashboard index this slice. The nav links to `/seller/products` and `/seller/inventory` will 404-redirect to `/` via the catch-all until 6b/6d — acceptable for 6a (or add minimal "coming soon" stubs; prefer leaving them to their sub-slices and noting the nav links are live-but-pending).

- [ ] **Step 1: Add the seller subtree to the router**

In `apps/admin/src/router.tsx`, import `SellerOnlyRoute` and `SellerDashboardPage`, and add a sibling group inside the `AppShell` children (alongside the `AdminOnlyRoute` group):

```tsx
import { SellerOnlyRoute } from './auth/SellerOnlyRoute';
import { SellerDashboardPage } from './pages/SellerDashboardPage';
// ...
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'inventory', element: <InventoryPage /> },
          { path: 'inventory/:productId', element: <InventoryItemPage /> },
          {
            element: <AdminOnlyRoute />,
            children: [ /* ...unchanged admin routes... */ ],
          },
          {
            element: <SellerOnlyRoute />,
            children: [
              { path: 'seller', element: <SellerDashboardPage /> },
            ],
          },
        ],
```

NOTE on the index dashboard: the shell index (`{ index: true, element: <DashboardPage /> }`) renders the ADMIN dashboard at `/`. A SELLER landing on `/` would see the admin DashboardPage (which calls `listProducts` → the admin `/products` endpoint → 403 for a seller). To avoid that, make the index role-aware: render `SellerDashboardPage` for a seller, else `DashboardPage`. Implement a tiny `IndexDashboard` wrapper:

Create the wrapper inline in `router.tsx` is not ideal; instead add a small component. Simplest correct approach: a `DashboardRouter` component that branches:

```tsx
// in a new file apps/admin/src/pages/IndexDashboard.tsx
import { useAuth } from '../auth/AuthContext';
import { DashboardPage } from './DashboardPage';
import { SellerDashboardPage } from './SellerDashboardPage';

export function IndexDashboard() {
  const { user } = useAuth();
  return user?.role === 'SELLER' ? <SellerDashboardPage /> : <DashboardPage />;
}
```

and use `{ index: true, element: <IndexDashboard /> }` for the shell index. Then the seller nav "Dashboard" link (to `/`) shows the seller dashboard, and `/seller` also shows it. (Keep BOTH: `/` via IndexDashboard for the nav's `to="/"`, and optionally drop the separate `/seller` route — but the spec routes the dashboard at `/seller`. Resolution: point the seller nav "Dashboard" link at `/` (already does) and render IndexDashboard at index; the `/seller` route is redundant if the dashboard is at `/`. SIMPLER: keep the seller "Dashboard" nav link → `/` (index, role-branched via IndexDashboard), and DROP the separate `/seller` index route to avoid two homes for the same page. Update the spec's mental model: seller dashboard lives at `/` (role-branched), `/seller/products` + `/seller/inventory` are the seller subtree under SellerOnlyRoute.)

**Decision for this task:** render `IndexDashboard` at the shell index (role-branched). Under `SellerOnlyRoute`, this slice adds NO child yet (6b adds `/seller/products`, 6d adds `/seller/inventory`) — but `SellerOnlyRoute` needs at least a placeholder or it's an empty group. So: create the `IndexDashboard` file, wire it at index, and add the `SellerOnlyRoute` group with the two seller paths pointing at a tiny shared "coming soon" placeholder element this slice, to be replaced in 6b/6d. Add:

```tsx
          {
            element: <SellerOnlyRoute />,
            children: [
              { path: 'seller/products', element: <SellerComingSoon area="Products" /> },
              { path: 'seller/inventory', element: <SellerComingSoon area="Inventory" /> },
            ],
          },
```

Create `apps/admin/src/pages/SellerComingSoon.tsx`:

```tsx
export function SellerComingSoon({ area }: { area: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-2xl font-semibold text-content">{area}</h2>
      <p className="text-content-muted">This section is coming soon.</p>
    </section>
  );
}
```

(These placeholders make the nav links resolve to a real seller-gated page now; 6b/6d replace them with the real pages. This keeps 6a independently verifiable — every seller nav link works and stays inside the seller gate.)

- [ ] **Step 2: Build to verify routing compiles**

Run: `cd apps/admin && npm run build`
Expected: clean — `IndexDashboard`, `SellerComingSoon`, `SellerDashboardPage`, `SellerOnlyRoute` all resolve.

- [ ] **Step 3: Run the full admin test suite**

Run: `cd apps/admin && npm test`
Expected: all green (existing 174 + the new role/gate/dashboard/shell tests). 

- [ ] **Step 4: Lint**

Run: `cd apps/admin && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/router.tsx apps/admin/src/pages/IndexDashboard.tsx apps/admin/src/pages/SellerComingSoon.tsx
git commit -m "feat(admin): wire /seller subtree + role-branched index dashboard"
```

---

### Task 9: Sub-slice verification gate + browser smoke + tracker

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Full admin gate**

Run from `apps/admin`: `npm test` (full), `npm run lint`, `npm run build` (tsc+vite). From `apps/api`: `npx tsc -p tsconfig.build.json --noEmit` (seed change). From repo root: `git status --porcelain` (clean), `git worktree list` (the `improvment-UI` worktree is an active other-agent worktree — ignore).
Expected: all green.

- [ ] **Step 2: Browser smoke (RULE.md §5 — frontend slice)**

Seed if not already: `cd apps/api && npx prisma db seed`. Boot the API (`npm run start:dev`, :5000) and the admin app (`cd apps/admin && npm run dev`, :5002). In the browser:
1. Log in as `seller@example.com` / `Password123!` → lands on the **Seller dashboard** (shows "My products" = 2), seller nav (Dashboard / My Products / My Inventory), seller wordmark.
2. Click My Products / My Inventory → seller "coming soon" pages (gated, no AccessDenied).
3. Log out; log in as `admin@example.com` / `Password123!` → **admin** dashboard + admin nav unchanged; visiting `/seller/products` in the URL → AccessDenied.
4. (the seller visiting `/products` in the URL → AccessDenied.)
Stop both servers. Report what you observed.

- [ ] **Step 3: Update the tracker**

In `docs/IMPLEMENTATION_PLAN.md`, append to the M2 row: "slice 6a (seller-portal foundation — SELLER admitted to the shell, SellerOnlyRoute, role-branched nav + dashboard, seller API clients, seeded demo seller) done; next: 6b My Products."

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m2): mark slice 6a (seller portal foundation) done"
```

- [ ] **Step 5: STOP and ask the user to verify (RULE.md §1)**

Summarize; note 6b (My Products) is next. Do not push.

---

## Self-Review

**Spec coverage (against `2026-06-22-m2-slice6-admin-seller-portal-ui-design.md` §6a):**
- `Role` += `'SELLER'`; admit into shell → Tasks 2, 3. ✓
- `SellerOnlyRoute` → Task 4. ✓
- Role-branched `AppShell` nav + wordmark → Task 7. ✓
- `/seller` route + seller Dashboard (honest placeholders) → Tasks 6, 8 (dashboard role-branched at index via `IndexDashboard`). ✓
- Seller API clients (`sellerProducts` list now; `sellerInventory` stub) → Task 5. ✓
- Seed dev seller (idempotent) → Task 1. ✓
- Role-gate tests (mirror `AppShell.inventory.test.tsx`) → Tasks 4, 7. ✓
- Browser smoke with seeded seller → Task 9. ✓

**Resolved-during-planning ambiguity:** the spec routed the dashboard at `/seller`, but the shell index `/` renders the ADMIN dashboard (which 403s for a seller). Resolution (Task 8): a role-branched `IndexDashboard` at `/` (seller → SellerDashboardPage, else admin DashboardPage); the `/seller/*` subtree under `SellerOnlyRoute` hosts products/inventory (placeholders this slice). So the seller's "Dashboard" nav link → `/` works correctly. Documented in Task 8.

**Placeholder scan:** No TBD/TODO. The `SellerComingSoon` placeholders are intentional, real, gated pages that 6b/6d replace — not plan placeholders. Task 5 Step 5 flags one verify-against-real-API point (the `/seller/inventory` query/response shape) with an explicit fallback, because the exact `ListStockDto`/`StockRow` shape must be matched to live code — concrete instruction, not vagueness.

**Type consistency:** `canEnterShell(role: Role)` (Task 2) consumed in Task 3. `SellerOnlyRoute` (Task 4) consumed in Task 8. `listSellerProducts(query?): Promise<Paginated<Product>>` (Task 5) consumed in Task 6. `Role` widened in Task 2 is the base for everything. `IndexDashboard`/`SellerComingSoon`/`SellerDashboardPage` all defined before use in Task 8.

**Note on `npm run build`:** the admin app's build is `tsc + vite build` and DOES fail on tsc errors (unlike the API's `nest build`), so per-task `npm run build` is a trustworthy type gate here — no separate `tsc --noEmit` needed for the admin app.
