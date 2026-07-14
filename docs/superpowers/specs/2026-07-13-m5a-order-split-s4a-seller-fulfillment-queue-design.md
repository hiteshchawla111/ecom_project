# M5a S4a — Seller Fulfillment Queue — Design

> **Date:** 2026-07-13
> **Phase:** M5a (Order Split) of M5. Depends on S1/S2/S3 (all merged to `main`); consumes the S3 seller SubOrder API.
> **Branch:** `feat/order-split-s4a` (off `main`).
> **App:** `apps/admin` (React + Vite SPA — the seller portal lives inside the admin app per M2).
> **Status:** Approved design. One slice, stop-and-verify (RULE.md §1); TDD components (RULE.md §4); verify in the real app **light + dark** (RULE.md §10).

## Context

The order-split backend is complete (S1 schema, S2 placeOrder writes SubOrders, S3 state machine + rollup + seller API). **No UI surfaces it yet.** M5a S4 is the UI phase; it is sliced:

- **S4a — Seller fulfillment queue (this spec):** the seller-portal page where a seller sees + acts on their SubOrders. **Frontend-only, admin app** — the S3 API is ready. Also gives admins a cross-seller fulfillment surface (via the S3 guard bypass).
- **S4b — Backend read:** extend `getOrder`/`getAnyOrder` (+ `OrderView`/`AdminOrderView`) to expose `subOrders[]` — gates S4c/S4d.
- **S4c — Storefront customer order-detail** per-seller groups (needs S4b).
- **S4d — Admin order-detail** per-seller groups + **rewire the now-broken admin transition path** (S3 narrowed `PATCH /orders/:id/status` to customer-only; the admin order-detail still calls it) (needs S4b).

### Current state (verified)

- **S3 API (ready, no changes needed):** `GET /seller/suborders` (query `cursor?`/`limit?` 1–50 default 20/`status?`) → `{ data: SubOrderView[]; nextCursor: string | null }`, cursor = opaque `"<iso>_<id>"`, `createdAt desc, id desc`. `PATCH /seller/suborders/:id/status` (body `{status}`) → `SubOrderView`; 409 on invalid transition; ownership 404. `@Roles(SELLER, ADMIN)` + `SellerApprovedGuard` (admin bypass = cross-seller).
- **`SubOrderView`** (`orders.service.ts:117-135`): `{ id, orderId, status: SubOrderStatus, subtotal, discountTotal, taxTotal, shippingTotal, grandTotal (money strings), shipFullName, shipLine1, shipLine2|null, shipCity, shipState, shipCountry, shipPostalCode, items: SubOrderItemView[], createdAt }`. `SubOrderItemView`: `{ productId, productName, unitPrice, quantity, lineTotal, sellerName }`.
- **`SubOrderStatus`** = 7 values identical to `OrderStatus` (`PENDING CONFIRMED PROCESSING SHIPPED DELIVERED CANCELLED REFUNDED`). Valid transitions (from the reused `order-status.ts`): PENDING→{CONFIRMED,CANCELLED}, CONFIRMED→{PROCESSING,CANCELLED}, PROCESSING→{SHIPPED,CANCELLED}, SHIPPED→{DELIVERED}, DELIVERED→{REFUNDED}, CANCELLED/REFUNDED terminal.
- **Admin app patterns to mirror:** seller list page `pages/SellerProductsPage.tsx` (state + cancellation-guarded `useEffect` + `runAction` + `PageHeader` + `useConfirm`); transition UI `pages/OrderDetailPage.tsx` (`ACTION: Record<Status,{label,confirm}>` + `nextStatuses(status)` + `OrderStatusBadge` + `confirm({title,description,confirmLabel,destructive})`); `lib/orderTransitions.ts` (the `ALLOWED` map + `nextStatuses`); `lib/apiClient.ts` (`request<T>` w/ 401-refresh); `components/orders/OrderStatusBadge.tsx` (all 7 statuses, DESIGN.md semantic colors); `components/ui/confirm.tsx` (`useConfirm(): ConfirmFn`, `ConfirmOptions {title, description?, confirmLabel?, destructive?}`); `SellerOnlyRoute` + the `AppShell` role-branched seller nav block; `router.tsx` `SellerOnlyRoute` children group.
- **No cursor / load-more pattern exists** in the admin app — `components/ui/Pagination.tsx` is offset-only (`{page,total,totalPages}`), cannot consume `{data, nextCursor}`. S4a adds a simple "Load more" button (the one genuinely new UI piece).

## Decisions (approved)

1. **S4a = seller fulfillment queue only.** Frontend-only in `apps/admin`; no backend, no storefront, no admin order-detail/list changes.
2. **Layout:** a cursor-paginated list of SubOrder cards with **inline per-card status actions** (no separate detail page — items shown inline; the S3 API has no `GET /seller/suborders/:id`, so a detail page would need a new endpoint — avoided). A status-filter `<select>` maps to the API `?status`. "Load more" gated on `nextCursor`.

## Architecture / new files (`apps/admin/src`)

- **`lib/sellerSubOrders.ts`** — types + client:
  - `type SubOrderStatus = 'PENDING' | ... | 'REFUNDED'` (mirror `orders.ts` `OrderStatus`); `interface SubOrderItemView`, `interface SubOrderView`, `interface SubOrderPage { data: SubOrderView[]; nextCursor: string | null }` (money fields + `createdAt` are strings over the wire).
  - `fetchSubOrders(q: { cursor?: string; limit?: number; status?: SubOrderStatus }): Promise<SubOrderPage>` → `apiClient.request('/seller/suborders' + toQuery(q))`.
  - `updateSubOrderStatus(id: string, status: SubOrderStatus): Promise<SubOrderView>` → `apiClient.request('/seller/suborders/${id}/status', { method: 'PATCH', body: JSON.stringify({ status }) })`.
  - Mirrors `sellerProducts.ts` (incl. its local `toQuery`), but the list return is the cursor shape, NOT `Paginated<T>`.
- **`lib/subOrderTransitions.ts`** — mirror `orderTransitions.ts`: `ALLOWED: Record<SubOrderStatus, readonly SubOrderStatus[]>` (same 7-state map) + `nextStatuses(status)`. Plus an `ACTION: Record<SubOrderStatus, { label: string; confirm: string; destructive?: boolean }>` map for the transition buttons/confirm copy (mirror `OrderDetailPage`'s `ACTION`).
- **`pages/SellerOrdersPage.tsx`** — the queue page.
- **`components/orders/SubOrderCard.tsx`** — one card per SubOrder (or inline in the page; separate for testability).
- **Wiring:** `router.tsx` — add `{ path: 'seller/orders', element: <SellerOrdersPage /> }` to the `SellerOnlyRoute` children. `AppShell.tsx` — add a "Fulfillment" group (or an "Orders" `NavItem`) → `/seller/orders` in the seller nav block (`:103-115`); add an `orders` icon to the `ICONS` map if not present.

## Data flow & the load-more model

Page state: `items: SubOrderView[]`, `nextCursor: string | null`, `status: SubOrderStatus | ''`, `loading`, `error`, `busyId: string | null`, `refreshTick`.
- **Initial load / status-filter change:** `fetchSubOrders({ status, limit: 20 })` (no cursor) → **replace** `items`, set `nextCursor`. Cancellation-guarded `useEffect` keyed on `[status, refreshTick]` (mirror `SellerProductsPage`).
- **Load more:** `fetchSubOrders({ status, cursor: nextCursor, limit: 20 })` → **append** to `items`, update `nextCursor`. Button rendered only when `nextCursor !== null`; disabled while `loading`.
- **Transition a card:** `nextStatuses(card.status)` → a button per valid next status; destructive (CANCELLED/REFUNDED) styled red + confirm dialog (`useConfirm` with the `ACTION` copy). On confirm → `updateSubOrderStatus(id, next)` (guard via `busyId`): on success, **replace** that card's entry with the returned `SubOrderView`; if the new status no longer matches the active `status` filter, **drop** it from `items`. On failure (409/network) → inline error on the card; list untouched.
- No full refetch after a transition (keeps the list stable + avoids cursor re-walk); a manual reload via `refreshTick` is available if needed.

## The page & card

**`SellerOrdersPage`:** `PageHeader` ("Orders" / "Fulfil the orders placed with your shop.") + a status `<select>` (All + 7 statuses) + body (empty-state when `!loading && items.length===0`; else the card list; then "Load more"; loading/error states like sibling pages).

**`SubOrderCard`** (`{ subOrder, busy, onTransition }`):
- Header: `<OrderStatusBadge status={s.status} />` · `#{s.orderId.slice(-8)}` · `new Intl.DateTimeFormat` medium `createdAt` · `grandTotal` (usd formatter like `OrderDetailPage`).
- Ship-to: `s.shipFullName` — `s.shipCity, s.shipState`.
- Items: compact list `s.items.map` → `productName × quantity` — `lineTotal`.
- Actions: `nextStatuses(s.status).map` → a button (label from `ACTION`; destructive styling for CANCELLED/REFUNDED); disabled while `busy`. Terminal statuses render no actions. Inline per-card error slot.

**Design system (RULE.md §10 / DESIGN.md):** reuse `OrderStatusBadge` semantic colors (never color-alone — badge pairs color + label); tokens only, no hex; filled/brand action buttons per the existing button styling; destructive = error treatment. Build with the UI skills (`ui-ux-pro-max`/`shadcn` primitives as the sibling pages do). **Verify light + dark** (screenshot each).

## Testing (Vitest + RTL, mirror the admin seller-page tests)

- **`lib/sellerSubOrders.ts`:** `fetchSubOrders` builds the right query (`cursor`/`limit`/`status` passthrough, omit undefined) + returns `{data,nextCursor}`; `updateSubOrderStatus` PATCHes the right path/body. Mock `apiClient.request`.
- **`lib/subOrderTransitions.ts`:** `nextStatuses` returns the correct set per status; terminal → `[]`.
- **`SubOrderCard`:** renders badge/order-ref/total/ship/items; shows only valid next-status buttons; terminal → no actions; destructive button triggers confirm; delegates `onTransition(id, next)`.
- **`SellerOrdersPage`:** initial load renders cards; status filter refetches (replace); "Load more" appends + hides at `nextCursor===null`; a transition replaces/drops the card; error + empty states. Stub `fetchSubOrders`/`updateSubOrderStatus` (or global `apiClient`).

## Verification gate (RULE.md §5 + §10)

1. `npm test` (admin) green incl. new specs; `tsc -b` + `vite build` clean; `npm run lint` clean.
2. **Browser smoke, light + dark (screenshot each)** vs `ecom_dev` (API on :5000, admin on :5002, fresh — guard against stale servers):
   - Log in as the demo **seller** (`seller@example.com`) → nav shows the new Fulfillment/Orders link → `/seller/orders` lists only that seller's SubOrders.
   - Place a multi-seller order first (so the seller has a PENDING SubOrder); confirm the card shows status/order-ref/items/ship/total.
   - Drive `PENDING→CONFIRMED→PROCESSING→SHIPPED` via the card buttons; each updates the card in place; an invalid path isn't offered (only valid next-statuses shown).
   - Status filter narrows the list; "Load more" appends when >20 exist (or verify the button hides at end with fewer).
   - Cancel a PENDING one (destructive confirm) → card drops/updates.
   - As **admin**: `/seller/orders` shows cross-seller SubOrders (guard bypass), can transition any.
   - Both themes legible (badges, buttons, cards).
   - Clean up any test data on `ecom_dev`.

## Out of scope (YAGNI — S4a)

Backend changes (none — S3 API used as-is); storefront customer per-seller groups (S4c); admin order-detail restructure + transition rewire + stale-`updateOrderStatus` cleanup (S4d); backend read exposing subOrders on order-detail (S4b); a seller SubOrder **detail** page / `GET /seller/suborders/:id` (avoided — items shown inline).

## Risks

- **Cursor list correctness** (the new pattern) → append-not-replace on load-more, replace-on-filter-change, cancellation-guarded fetches; tested + smoked.
- **Showing an invalid transition** → client `nextStatuses` mirrors the API machine; API still enforces (409) — UX not boundary.
- **Card drift after transition** → replace with the returned `SubOrderView` (authoritative), drop if it leaves the active filter.
- **Dark-mode wash-out** (per prior slices) → reuse `OrderStatusBadge` tokens + verify light+dark screenshots (RULE.md §10; the theme-safe-button lesson).
- **Stale dev server** on :5000/:5002 → confirm fresh boot before smoke.
