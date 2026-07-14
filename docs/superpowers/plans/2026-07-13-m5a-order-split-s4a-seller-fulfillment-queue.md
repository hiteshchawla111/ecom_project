# M5a S4a — Seller Fulfillment Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This is UI work in `apps/admin` — implementers of the component/page tasks (3, 4) should use the `ui-ux-pro-max` / `shadcn` design skills and match the DESIGN.md "Quiet-Luxury" system + the existing seller pages; verify light + dark (RULE.md §10).**

**Goal:** A seller-portal `/seller/orders` page (admin app) where a seller sees a cursor-paginated list of their SubOrders and drives fulfillment via inline per-SubOrder status transitions — the first UI over the order-split backend.

**Architecture:** Frontend-only in `apps/admin`. A new cursor-shaped data client (`lib/sellerSubOrders.ts`) over the existing S3 API, a ported client-side transition map (`lib/subOrderTransitions.ts`), a presentational `SubOrderCard`, and a `SellerOrdersPage` that accumulates pages ("Load more") + a status filter, wired into the router + seller nav. Reuses `OrderStatusBadge`, `useConfirm`, `PageHeader`, `apiClient`.

**Tech Stack:** React + Vite + TypeScript, Vitest + RTL, Tailwind (DESIGN.md tokens). Mirrors `lib/sellerProducts.ts`, `lib/orderTransitions.ts`, `pages/SellerProductsPage.tsx` + `pages/OrderDetailPage.tsx` (transition UI), and the admin test conventions.

## Global Constraints

- **Frontend-only, `apps/admin`.** No backend changes (S3 API used as-is): `GET /seller/suborders?cursor=&limit=&status=` → `{ data: SubOrderView[]; nextCursor: string | null }`; `PATCH /seller/suborders/:id/status` (body `{status}`) → `SubOrderView`.
- **`SubOrderStatus`** = 7 values, identical to `OrderStatus`: `PENDING CONFIRMED PROCESSING SHIPPED DELIVERED CANCELLED REFUNDED`. Valid transitions: PENDING→{CONFIRMED,CANCELLED}, CONFIRMED→{PROCESSING,CANCELLED}, PROCESSING→{SHIPPED,CANCELLED}, SHIPPED→{DELIVERED}, DELIVERED→{REFUNDED}, CANCELLED/REFUNDED terminal.
- **`SubOrderView`** fields: `id, orderId, status, subtotal, discountTotal, taxTotal, shippingTotal, grandTotal` (money strings), `shipFullName, shipLine1, shipLine2|null, shipCity, shipState, shipCountry, shipPostalCode, items: SubOrderItemView[], createdAt` (string). `SubOrderItemView`: `productId, productName, unitPrice, quantity, lineTotal, sellerName`.
- **Cursor list, not offset.** The list return is `{data, nextCursor}` — NOT `Paginated<T>`; the offset `Pagination` component cannot be reused. Load-more accumulates: initial/filter-change **replaces**, "Load more" **appends**, button shown only when `nextCursor !== null`.
- **Only valid next-statuses offered** (client mirror of the API machine; API still enforces via 409). Destructive (CANCELLED/REFUNDED) → `useConfirm` dialog + red styling.
- **Reuse** `components/orders/OrderStatusBadge.tsx` (all 7 statuses, DESIGN.md semantic colors — pair color + label, never color-alone), `components/ui/confirm.tsx` (`useConfirm(): ConfirmFn`), `components/ui/PageHeader` (or the existing `PageHeader` used by seller pages), `lib/apiClient.ts` (`request<T>`).
- **Design system:** DESIGN.md tokens only (no hex); match the existing seller pages + `OrderDetailPage`. Filled/brand buttons per existing styling; destructive = error treatment. **Verify light + dark** (screenshot each).
- **Strict TS, no `any`** in impl (test `any`/`ReturnType<typeof vi.fn>` casts are the repo convention).
- **Commands** (from `apps/admin/`): `npm test -- <pattern>`, `npm test`, `npx tsc -b`, `npm run build`, `npm run lint`. Admin dev port **:5002 (strictPort)**; api :5000. Branch `feat/order-split-s4a`. Push only; user lands the PR.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/admin/src/lib/sellerSubOrders.ts` (create) | Types (`SubOrderStatus`, `SubOrderItemView`, `SubOrderView`, `SubOrderPage`) + `fetchSubOrders` / `updateSubOrderStatus`. |
| `apps/admin/src/lib/sellerSubOrders.test.ts` (create) | Client unit tests. |
| `apps/admin/src/lib/subOrderTransitions.ts` (create) | `ALLOWED` map + `nextStatuses` + `ACTION` label/confirm map. |
| `apps/admin/src/lib/subOrderTransitions.test.ts` (create) | Transition-map tests. |
| `apps/admin/src/components/orders/SubOrderCard.tsx` (create) | Presentational card + inline transition actions. |
| `apps/admin/src/components/orders/SubOrderCard.test.tsx` (create) | Component tests. |
| `apps/admin/src/pages/SellerOrdersPage.tsx` (create) | The queue page (state, filter, load-more, transition wiring). |
| `apps/admin/src/pages/SellerOrdersPage.test.tsx` (create) | Page tests. |
| `apps/admin/src/router.tsx` (modify) | Add `seller/orders` route to the `SellerOnlyRoute` group. |
| `apps/admin/src/components/AppShell.tsx` (modify) | Add the seller "Orders/Fulfillment" nav link (+ an `orders` ICON if absent). |

Build order: client (T1) → transitions (T2) → card (T3) → page + wiring + verification (T4).

---

### Task 1: `sellerSubOrders` data client

**Files:**
- Create: `apps/admin/src/lib/sellerSubOrders.ts`
- Test: `apps/admin/src/lib/sellerSubOrders.test.ts`

**Interfaces:**
- Consumes: `apiClient.request` from `./apiClient`.
- Produces: `SubOrderStatus`, `SubOrderItemView`, `SubOrderView`, `SubOrderPage` types; `fetchSubOrders(q): Promise<SubOrderPage>`; `updateSubOrderStatus(id, status): Promise<SubOrderView>`.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/lib/sellerSubOrders.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from './apiClient';
import { fetchSubOrders, updateSubOrderStatus } from './sellerSubOrders';

vi.mock('./apiClient', () => ({ apiClient: { request: vi.fn() } }));
const req = () => apiClient.request as ReturnType<typeof vi.fn>;

describe('fetchSubOrders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs /seller/suborders with cursor/limit/status, omitting undefined', async () => {
    req().mockResolvedValue({ data: [], nextCursor: null });
    await fetchSubOrders({ cursor: 'c1', limit: 20, status: 'PENDING' });
    expect(apiClient.request).toHaveBeenCalledWith(
      '/seller/suborders?cursor=c1&limit=20&status=PENDING',
    );
  });

  it('GETs /seller/suborders with no query string when no params', async () => {
    req().mockResolvedValue({ data: [], nextCursor: null });
    await fetchSubOrders({});
    expect(apiClient.request).toHaveBeenCalledWith('/seller/suborders');
  });

  it('returns the {data, nextCursor} page', async () => {
    const pageData = { data: [{ id: 's1' }], nextCursor: '2026-07-01T00:00:00.000Z_s1' };
    req().mockResolvedValue(pageData);
    await expect(fetchSubOrders({ limit: 20 })).resolves.toEqual(pageData);
  });
});

describe('updateSubOrderStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PATCHes /seller/suborders/:id/status with the status body', async () => {
    req().mockResolvedValue({ id: 's1', status: 'CONFIRMED' });
    await updateSubOrderStatus('s1', 'CONFIRMED');
    expect(apiClient.request).toHaveBeenCalledWith('/seller/suborders/s1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CONFIRMED' }),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && npm test -- sellerSubOrders.test.ts`
Expected: FAIL — cannot resolve `./sellerSubOrders`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/admin/src/lib/sellerSubOrders.ts`:

```ts
import { apiClient } from './apiClient';

/** Mirrors the API SubOrderStatus enum (identical to OrderStatus values). */
export type SubOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface SubOrderItemView {
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  sellerName: string;
}

export interface SubOrderView {
  id: string;
  orderId: string;
  status: SubOrderStatus;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  shipFullName: string;
  shipLine1: string;
  shipLine2: string | null;
  shipCity: string;
  shipState: string;
  shipCountry: string;
  shipPostalCode: string;
  items: SubOrderItemView[];
  createdAt: string;
}

/** Cursor-paginated page (NOT the offset Paginated<T> shape). */
export interface SubOrderPage {
  data: SubOrderView[];
  nextCursor: string | null;
}

export interface ListSubOrdersQuery {
  cursor?: string;
  limit?: number;
  status?: SubOrderStatus;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** The acting seller's SubOrders (scoped server-side; admin sees cross-seller). */
export function fetchSubOrders(query: ListSubOrdersQuery = {}): Promise<SubOrderPage> {
  const path = `/seller/suborders${toQuery({
    cursor: query.cursor,
    limit: query.limit,
    status: query.status,
  })}`;
  return apiClient.request<SubOrderPage>(path);
}

/** Transition one SubOrder; 404 if not the caller's, 409 if the move is invalid. */
export function updateSubOrderStatus(
  id: string,
  status: SubOrderStatus,
): Promise<SubOrderView> {
  return apiClient.request<SubOrderView>(`/seller/suborders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && npm test -- sellerSubOrders.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/admin/src/lib/sellerSubOrders.ts apps/admin/src/lib/sellerSubOrders.test.ts
git commit -m "feat(admin-orders): sellerSubOrders cursor client (S4a)"
```

---

### Task 2: `subOrderTransitions` map

**Files:**
- Create: `apps/admin/src/lib/subOrderTransitions.ts`
- Test: `apps/admin/src/lib/subOrderTransitions.test.ts`

**Interfaces:**
- Consumes: `SubOrderStatus` from `./sellerSubOrders`.
- Produces: `nextStatuses(status: SubOrderStatus): readonly SubOrderStatus[]`; `ACTION: Record<SubOrderStatus, { label: string; confirm: string; destructive?: boolean }>`.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/lib/subOrderTransitions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextStatuses, ACTION } from './subOrderTransitions';

describe('nextStatuses (sub-order)', () => {
  it('mirrors the API state machine', () => {
    expect(nextStatuses('PENDING')).toEqual(['CONFIRMED', 'CANCELLED']);
    expect(nextStatuses('CONFIRMED')).toEqual(['PROCESSING', 'CANCELLED']);
    expect(nextStatuses('PROCESSING')).toEqual(['SHIPPED', 'CANCELLED']);
    expect(nextStatuses('SHIPPED')).toEqual(['DELIVERED']);
    expect(nextStatuses('DELIVERED')).toEqual(['REFUNDED']);
  });

  it('returns no transitions for terminal states', () => {
    expect(nextStatuses('CANCELLED')).toEqual([]);
    expect(nextStatuses('REFUNDED')).toEqual([]);
  });
});

describe('ACTION', () => {
  it('marks CANCELLED and REFUNDED as destructive with confirm copy', () => {
    expect(ACTION.CANCELLED.destructive).toBe(true);
    expect(ACTION.REFUNDED.destructive).toBe(true);
    expect(ACTION.CONFIRMED.destructive).toBeFalsy();
    expect(typeof ACTION.SHIPPED.label).toBe('string');
    expect(typeof ACTION.CANCELLED.confirm).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && npm test -- subOrderTransitions.test.ts`
Expected: FAIL — cannot resolve `./subOrderTransitions`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/admin/src/lib/subOrderTransitions.ts`:

```ts
import type { SubOrderStatus } from './sellerSubOrders';

/**
 * Valid next statuses per SubOrder status — mirrors the API's authoritative
 * state machine (`apps/api/src/orders/order-status.ts`, reused on SubOrder).
 * UX only; the API still enforces the move (409 on invalid).
 */
const ALLOWED: Record<SubOrderStatus, readonly SubOrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/** The statuses a sub-order may transition into from `status`. */
export function nextStatuses(status: SubOrderStatus): readonly SubOrderStatus[] {
  return ALLOWED[status];
}

/** Button label + confirm copy for transitioning INTO each status. */
export const ACTION: Record<
  SubOrderStatus,
  { label: string; confirm: string; destructive?: boolean }
> = {
  PENDING: { label: 'Reset to pending', confirm: 'Move this sub-order back to pending?' },
  CONFIRMED: { label: 'Confirm', confirm: 'Confirm this sub-order?' },
  PROCESSING: { label: 'Start processing', confirm: 'Mark this sub-order as processing?' },
  SHIPPED: { label: 'Mark shipped', confirm: 'Mark this sub-order as shipped? Reserved stock will be deducted.' },
  DELIVERED: { label: 'Mark delivered', confirm: 'Mark this sub-order as delivered?' },
  CANCELLED: { label: 'Cancel', confirm: 'Cancel this sub-order? Reserved stock will be released.', destructive: true },
  REFUNDED: { label: 'Refund', confirm: 'Refund this sub-order? Items will be restocked.', destructive: true },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && npm test -- subOrderTransitions.test.ts`
Expected: PASS (2 describes).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/admin/src/lib/subOrderTransitions.ts apps/admin/src/lib/subOrderTransitions.test.ts
git commit -m "feat(admin-orders): subOrderTransitions map (S4a)"
```

---

### Task 3: `SubOrderCard` presentational component

**Files:**
- Create: `apps/admin/src/components/orders/SubOrderCard.tsx`
- Test: `apps/admin/src/components/orders/SubOrderCard.test.tsx`

**Interfaces:**
- Consumes: `SubOrderView`, `SubOrderStatus` from `../../lib/sellerSubOrders`; `nextStatuses`, `ACTION` from `../../lib/subOrderTransitions`; `OrderStatusBadge` from `./OrderStatusBadge`.
- Produces: `SubOrderCard({ subOrder, busy, error, onTransition }: { subOrder: SubOrderView; busy: boolean; error: string | null; onTransition: (id: string, next: SubOrderStatus) => void })`.

**Design note:** implementer should use the `ui-ux-pro-max`/`shadcn` skills + match the DESIGN.md tokens and the existing seller-page/`OrderDetailPage` styling. The code below is a correct, token-classed baseline — refine the visual polish within the token system, keep the behavior + test contract.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/components/orders/SubOrderCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubOrderCard } from './SubOrderCard';
import type { SubOrderView } from '../../lib/sellerSubOrders';

const sub = (over: Partial<SubOrderView> = {}): SubOrderView => ({
  id: 'sub-123456789',
  orderId: 'order-abcdefgh',
  status: 'PENDING',
  subtotal: '100.00', discountTotal: '0.00', taxTotal: '8.00', shippingTotal: '5.00', grandTotal: '113.00',
  shipFullName: 'Ada Lovelace', shipLine1: '1 Analytical Way', shipLine2: null,
  shipCity: 'London', shipState: 'LDN', shipCountry: 'UK', shipPostalCode: 'EC1',
  items: [{ productId: 'p1', productName: 'Widget', unitPrice: '50.00', quantity: 2, lineTotal: '100.00', sellerName: 'Shop One' }],
  createdAt: '2026-07-01T12:00:00.000Z',
  ...over,
});

describe('SubOrderCard', () => {
  it('renders status, order ref, total, ship-to and items', () => {
    render(<SubOrderCard subOrder={sub()} busy={false} error={null} onTransition={vi.fn()} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText(/cdefgh/i)).toBeInTheDocument(); // order-ref tail (last 8 of orderId)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/Widget/)).toBeInTheDocument();
  });

  it('shows only valid next-status action buttons (PENDING → Confirm, Cancel)', () => {
    render(<SubOrderCard subOrder={sub({ status: 'PENDING' })} busy={false} error={null} onTransition={vi.fn()} />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ship/i })).toBeNull();
  });

  it('renders no action buttons for a terminal status', () => {
    render(<SubOrderCard subOrder={sub({ status: 'DELIVERED' })} busy={false} error={null} onTransition={vi.fn()} />);
    // DELIVERED → REFUNDED is the only move; assert CONFIRM/CANCEL/SHIP are absent, REFUND present
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull();
    expect(screen.getByRole('button', { name: /refund/i })).toBeInTheDocument();
    render(<SubOrderCard subOrder={sub({ status: 'CANCELLED' })} busy={false} error={null} onTransition={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('calls onTransition(id, next) when an action is clicked', async () => {
    const onTransition = vi.fn();
    render(<SubOrderCard subOrder={sub({ status: 'PENDING' })} busy={false} error={null} onTransition={onTransition} />);
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onTransition).toHaveBeenCalledWith('sub-123456789', 'CONFIRMED');
  });

  it('disables actions when busy and shows an inline error', () => {
    render(<SubOrderCard subOrder={sub({ status: 'PENDING' })} busy={true} error="Nope" onTransition={vi.fn()} />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
    expect(screen.getByText('Nope')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && npm test -- SubOrderCard.test.tsx`
Expected: FAIL — cannot resolve `./SubOrderCard`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/admin/src/components/orders/SubOrderCard.tsx`:

```tsx
import type { SubOrderStatus, SubOrderView } from '../../lib/sellerSubOrders';
import { nextStatuses, ACTION } from '../../lib/subOrderTransitions';
import { OrderStatusBadge } from './OrderStatusBadge';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (s: string) => usd.format(Number(s));
const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

interface SubOrderCardProps {
  subOrder: SubOrderView;
  busy: boolean;
  error: string | null;
  onTransition: (id: string, next: SubOrderStatus) => void;
}

export function SubOrderCard({ subOrder, busy, error, onTransition }: SubOrderCardProps) {
  const s = subOrder;
  const actions = nextStatuses(s.status);
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={s.status} />
          <span className="text-sm text-content-muted">#{s.orderId.slice(-8)}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-content-muted">{dateFmt.format(new Date(s.createdAt))}</span>
          <span className="font-medium text-content tabular-nums">{money(s.grandTotal)}</span>
        </div>
      </div>

      <p className="mt-2 text-sm text-content-muted">
        Ship to <span className="text-content">{s.shipFullName}</span> — {s.shipCity}, {s.shipState}
      </p>

      <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
        {s.items.map((it) => (
          <li key={it.productId} className="flex justify-between gap-4 py-2">
            <span className="text-content">
              {it.productName} <span className="text-content-muted">× {it.quantity}</span>
            </span>
            <span className="tabular-nums text-content-muted">{money(it.lineTotal)}</span>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-error-600">{error}</p>
      ) : null}

      {actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((next) => {
            const a = ACTION[next];
            return (
              <button
                key={next}
                type="button"
                disabled={busy}
                onClick={() => onTransition(s.id, next)}
                className={
                  a.destructive
                    ? 'rounded-md border border-error-500/40 px-3 py-1.5 text-sm font-medium text-error-600 transition-colors hover:bg-error-500/10 disabled:cursor-not-allowed disabled:opacity-50'
                    : 'rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50'
                }
              >
                {a.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
```

*(Token/class polish may be refined with the UI skills; keep the behavior + the test contract — badge, order-ref tail, ship-to, items, valid-only actions, disabled-when-busy, inline error, `onTransition(id, next)`.)*

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/admin && npm test -- SubOrderCard.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/admin/src/components/orders/SubOrderCard.tsx apps/admin/src/components/orders/SubOrderCard.test.tsx
git commit -m "feat(admin-orders): SubOrderCard with inline status actions (S4a)"
```

---

### Task 4: `SellerOrdersPage` + wiring + verification

**Files:**
- Create: `apps/admin/src/pages/SellerOrdersPage.tsx`
- Test: `apps/admin/src/pages/SellerOrdersPage.test.tsx`
- Modify: `apps/admin/src/router.tsx` (add `seller/orders` to the `SellerOnlyRoute` children)
- Modify: `apps/admin/src/components/AppShell.tsx` (seller nav link + `orders` ICON if absent)

**Interfaces:**
- Consumes: `fetchSubOrders`, `updateSubOrderStatus`, `SubOrderView`, `SubOrderStatus` (T1); `SubOrderCard` (T3); `useConfirm` from `../components/ui/confirm`; `ACTION` from `../lib/subOrderTransitions`; `PageHeader` (mirror what `SellerProductsPage` uses).

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/pages/SellerOrdersPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SubOrderPage, SubOrderView } from '../lib/sellerSubOrders';

const fetchSubOrders = vi.fn();
const updateSubOrderStatus = vi.fn();
vi.mock('../lib/sellerSubOrders', () => ({
  fetchSubOrders: (...a: unknown[]) => fetchSubOrders(...a),
  updateSubOrderStatus: (...a: unknown[]) => updateSubOrderStatus(...a),
}));

import { SellerOrdersPage } from './SellerOrdersPage';
import { ConfirmProvider } from '../components/ui/confirm';

const sub = (over: Partial<SubOrderView> = {}): SubOrderView => ({
  id: 'sub1', orderId: 'order-abcdefgh', status: 'PENDING',
  subtotal: '100.00', discountTotal: '0.00', taxTotal: '8.00', shippingTotal: '5.00', grandTotal: '113.00',
  shipFullName: 'Ada', shipLine1: '1 St', shipLine2: null, shipCity: 'London', shipState: 'LDN', shipCountry: 'UK', shipPostalCode: 'EC1',
  items: [{ productId: 'p1', productName: 'Widget', unitPrice: '50.00', quantity: 2, lineTotal: '100.00', sellerName: 'Shop One' }],
  createdAt: '2026-07-01T12:00:00.000Z', ...over,
});
const pageOf = (data: SubOrderView[], nextCursor: string | null = null): SubOrderPage => ({ data, nextCursor });

const renderPage = () =>
  render(
    <ConfirmProvider>
      <MemoryRouter><SellerOrdersPage /></MemoryRouter>
    </ConfirmProvider>,
  );

describe('SellerOrdersPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads and renders sub-order cards', async () => {
    fetchSubOrders.mockResolvedValue(pageOf([sub()]));
    renderPage();
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(fetchSubOrders).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  it('shows the empty state when there are no sub-orders', async () => {
    fetchSubOrders.mockResolvedValue(pageOf([]));
    renderPage();
    expect(await screen.findByText(/no orders/i)).toBeInTheDocument();
  });

  it('appends the next page on Load more and hides the button at the end', async () => {
    fetchSubOrders
      .mockResolvedValueOnce(pageOf([sub({ id: 'sub1', shipFullName: 'Ada' })], 'cur1'))
      .mockResolvedValueOnce(pageOf([sub({ id: 'sub2', shipFullName: 'Grace' })], null));
    renderPage();
    await screen.findByText('Ada');
    await userEvent.click(screen.getByRole('button', { name: /load more/i }));
    await screen.findByText('Grace');
    expect(fetchSubOrders).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cur1' }));
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('transitions a card (confirm dialog) and updates it in place', async () => {
    fetchSubOrders.mockResolvedValue(pageOf([sub({ id: 'sub1', status: 'PENDING' })]));
    updateSubOrderStatus.mockResolvedValue(sub({ id: 'sub1', status: 'CONFIRMED' }));
    renderPage();
    await screen.findByText('Ada');
    // Card's "Confirm" action opens the confirm dialog.
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    // confirm.tsx uses shadcn/Radix AlertDialog → role="alertdialog"; its action label is "Confirm".
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^confirm$/i }));
    await waitFor(() => expect(updateSubOrderStatus).toHaveBeenCalledWith('sub1', 'CONFIRMED'));
    await waitFor(() => expect(screen.getByText('Confirmed')).toBeInTheDocument());
  });
});
```

*(Verified: `confirm.tsx` renders a shadcn/Radix `AlertDialog` — its content has `role="alertdialog"` and the action button's accessible name is `confirmLabel` = `'Confirm'` (pinned in `onTransition`). The `uppercase` styling is CSS-only, so the accessible name stays "Confirm" — the `within(dialog)` scope disambiguates it from the card's own "Confirm" button.)*

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin && npm test -- SellerOrdersPage.test.tsx`
Expected: FAIL — cannot resolve `./SellerOrdersPage`.

- [ ] **Step 3: Write the page**

Create `apps/admin/src/pages/SellerOrdersPage.tsx` (mirror `SellerProductsPage`'s structure — `PageHeader`, cancellation-guarded fetch, `useConfirm`, error/loading/empty states — adapted to the cursor load-more model):

```tsx
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { useConfirm } from '../components/ui/confirm';
import { SubOrderCard } from '../components/orders/SubOrderCard';
import { ACTION } from '../lib/subOrderTransitions';
import {
  fetchSubOrders,
  updateSubOrderStatus,
  type SubOrderStatus,
  type SubOrderView,
} from '../lib/sellerSubOrders';
import { ApiError } from '../lib/types';

const STATUSES: SubOrderStatus[] = [
  'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED',
];
const PAGE_SIZE = 20;

export function SellerOrdersPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<SubOrderView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<SubOrderStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cardError, setCardError] = useState<Record<string, string>>({});

  // Initial load / status-filter change: replace the list.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSubOrders({ limit: PAGE_SIZE, status: status || undefined })
      .then((page) => {
        if (cancelled) return;
        setItems(page.data);
        setNextCursor(page.nextCursor);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'Failed to load orders');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchSubOrders({ limit: PAGE_SIZE, status: status || undefined, cursor: nextCursor });
      setItems((prev) => [...prev, ...page.data]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, status]);

  const onTransition = useCallback(
    async (id: string, next: SubOrderStatus) => {
      const ok = await confirm({
        title: ACTION[next].label,
        description: ACTION[next].confirm,
        confirmLabel: 'Confirm', // stable dialog action label (the dialog defaults to "Confirm"); keeps it distinct+testable from the per-status card button labels
        destructive: ACTION[next].destructive,
      });
      if (!ok) return;
      setBusyId(id);
      setCardError((m) => {
        const { [id]: _drop, ...rest } = m;
        return rest;
      });
      try {
        const updated = await updateSubOrderStatus(id, next);
        setItems((prev) =>
          // drop if it no longer matches the active filter, else replace in place
          prev.flatMap((s) =>
            s.id === id ? (status && updated.status !== status ? [] : [updated]) : [s],
          ),
        );
      } catch (e) {
        setCardError((m) => ({ ...m, [id]: e instanceof ApiError ? e.message : 'Transition failed' }));
      } finally {
        setBusyId(null);
      }
    },
    [confirm, status],
  );

  return (
    <div>
      <PageHeader title="Orders" description="Fulfil the orders placed with your shop." />

      <div className="mb-4">
        <label className="text-sm text-content-muted">
          Status{' '}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as SubOrderStatus | '')}
            className="ml-2 rounded-md border border-line bg-surface px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p role="alert" className="text-sm text-error-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-content-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-content-muted">No orders yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((s) => (
            <SubOrderCard
              key={s.id}
              subOrder={s}
              busy={busyId === s.id}
              error={cardError[s.id] ?? null}
              onTransition={onTransition}
            />
          ))}
        </div>
      )}

      {nextCursor ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-4 rounded-md border border-line px-4 py-2 text-sm font-medium text-content transition-colors hover:border-content disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}
```

*(Adjust the `PageHeader` import path + prop names, the `ApiError` import, and any class tokens to match the exact sibling-page conventions — read `SellerProductsPage.tsx` for the precise `PageHeader` usage + error-type import. Keep the behavior + test contract.)*

- [ ] **Step 4: Wire the route + nav**

`apps/admin/src/router.tsx` — add to the `SellerOnlyRoute` children (next to `seller/products`):
```tsx
{ path: 'seller/orders', element: <SellerOrdersPage /> },
```
(plus the `import { SellerOrdersPage } from './pages/SellerOrdersPage';`).

`apps/admin/src/components/AppShell.tsx` — in the seller nav block (the `isSeller` branch, ~`:103-115`), add a nav item (a new "Fulfillment" group or within an "Orders" group):
```tsx
<NavItem to="/seller/orders" icon="orders">Orders</NavItem>
```
If `ICONS` has no `orders` key, add one (copy an existing SVG entry's shape from the `ICONS` map, ~`:21-30`; reuse an appropriate icon).

- [ ] **Step 5: Run the page test + full suite + build**

Run: `cd apps/admin && npm test -- SellerOrdersPage.test.tsx`
Expected: PASS (4 tests). (If the ConfirmProvider dialog-button selector mismatches, align it to `confirm.tsx`'s actual label per the Step-1 note.)

Run: `npm test`
Expected: full admin suite green incl. all new specs.

Run: `npx tsc -b && npm run build`
Expected: clean (catches any type/import error).

Run: `npm run lint`
Expected: clean on changed files. If `--fix` reformats UNRELATED files, do NOT stage them — `git add` only the S4a files; `git checkout --` any stray.

- [ ] **Step 6: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/admin/src/pages/SellerOrdersPage.tsx apps/admin/src/pages/SellerOrdersPage.test.tsx apps/admin/src/router.tsx apps/admin/src/components/AppShell.tsx
git commit -m "feat(admin-orders): SellerOrdersPage fulfillment queue + nav/route wiring (S4a)"
```

---

## Final Verification (before declaring the slice done — RULE.md §5 + §10)

Not a code task — a gate after Task 4.

- [ ] `npm test` (admin) green incl. all new specs; `tsc -b` + `vite build` clean; `npm run lint` clean on changed files.
- [ ] **Browser smoke, light + dark (screenshot each)** vs `ecom_dev` — start API (:5000) + admin (:5002) fresh (kill any stale servers first):
  - [ ] Ensure the demo seller (`seller@example.com`) has at least one SubOrder — place a multi-seller order via the storefront/API if needed (the demo seller's product may lack an InventoryItem — insert a temp one for the order, remove in cleanup, per prior slices).
  - [ ] Log in as the **seller** → the seller nav shows the new "Orders" link → `/seller/orders` lists only that seller's SubOrders (card: status badge, order ref, items, ship-to, total).
  - [ ] Drive `PENDING→CONFIRMED→PROCESSING→SHIPPED` via the card buttons (destructive Cancel shows a confirm dialog); each updates the card in place; only valid next-statuses are offered.
  - [ ] Status filter narrows the list; "Load more" appends when >20 SubOrders exist (or the button is absent with fewer).
  - [ ] Log in as **admin** → `/seller/orders` shows cross-seller SubOrders; admin can transition any.
  - [ ] Both **light and dark** themes: badges, buttons, cards all legible (no wash-out).
  - [ ] Clean up any test data on `ecom_dev`.
- [ ] Update `docs/IMPLEMENTATION_PLAN.md`: M5a S4a ✅ with a one-line summary.
- [ ] STOP and ask the user to verify (RULE.md §1). Push only when asked.

## Self-Review Notes (author)

- **Spec coverage:** cursor client (T1), transition map + action copy (T2), card with valid-only actions + destructive confirm + inline error + disabled-when-busy (T3), page with replace-on-filter / append-on-load-more / transition-updates-in-place-or-drops + empty/error/loading + status filter + route/nav wiring (T4), light/dark verification (final gate). All covered.
- **Type consistency:** `SubOrderStatus`/`SubOrderView`/`SubOrderPage` (T1) consumed by T2/T3/T4; `nextStatuses`/`ACTION` (T2) by T3/T4; `SubOrderCard` props (T3) used by T4; `fetchSubOrders`/`updateSubOrderStatus` signatures stable across T1→T4.
- **No placeholders:** every code step has full content. Verified-and-pinned: `PageHeader` (`../components/ui/PageHeader`, props `{eyebrow?,title,description?,actions?}`), `ApiError` (`../lib/types`), and the confirm dialog is shadcn/Radix `AlertDialog` → `role="alertdialog"` with a `confirmLabel: 'Confirm'` action (pinned in `onTransition`); the page-test dialog selector uses `within(findByRole('alertdialog'))` — no hedge left.
- **Test determinism:** the confirm dialog's action label is pinned to `'Confirm'` (not the per-status action label), and the dialog click is scoped via `within(alertdialog)` so it never collides with the card's own "Confirm" button.
