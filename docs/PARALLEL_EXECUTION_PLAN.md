# PARALLEL_EXECUTION_PLAN.md — Parallelization & Dependency Graph

> **Status:** Architecture document. For each phase in `IMPLEMENTATION_PLAN.md`: can it run in parallel, why, what it depends on, what it blocks, and the recommended worktree. Ends with the consolidated dependency graph.
>
> **Assumes** the evolve-in-place / modular-monolith / event-driven decisions in `ARCHITECTURE_DECISIONS.md`. Parallelism is bounded by two real constraints: (1) **shared schema** — two branches editing `schema.prisma` / running migrations against the same DB will collide; (2) **shared integration points** — the checkout flow and the totals pipeline are touched by several phases.
> **Date:** 2026-06-19

---

## 0. How Parallelism Works Here (constraints)

1. **Schema serialization.** Migrations are globally ordered (`MIGRATION_PLAN.md`). Parallel branches may *develop* concurrently, but their migrations must be **applied in dependency order** and each branch should own a disjoint set of tables. Two branches must not both alter the same table in the same window.
2. **Use git worktrees** (`apps/*` are one repo) so parallel branches don't fight over the working tree. Each phase below names a worktree.
3. **Integration choke points.** `placeOrder`/checkout (M5a) and the totals pipeline (ADR-014) are shared. Phases that feed them (coupons M6b → discount, logistics M5c → shipping) must integrate *after* M5a defines the per-seller structure. Treat M5a as a synchronization barrier.
4. **Provider interfaces decouple** (ADR-009): payments, search, shipping, notifications, cache each sit behind an interface, so those phases don't touch each other's code — only their own module + the shared event bus.
5. **One slice at a time within a phase** (RULE.md). "Parallel" here means *across phases/worktrees*, not abandoning the stop-and-verify discipline inside a phase.

---

## 1. Per-Phase Parallelization

### M1 — Marketplace Foundation
- **Can run in parallel:** NO (it's the root).
- **Why:** Introduces the `SELLER` enum, `Seller` table, `AuditService`, and event conventions that every later phase imports. Touches `auth`, `app.module`, `main.ts` — shared infrastructure.
- **Depends on:** M0 (baseline).
- **Blocks:** everything (M2–M7).
- **Can run with:** nothing.
- **Recommended worktree:** `feat/marketplace-foundation`.

### M2 — Seller System
- **Can run in parallel:** NO (single critical-path gate).
- **Why:** Owns the one breaking migration (`Product.sellerId` + SKU composite-unique, B1–B5) and establishes the seller-ownership pattern. Any catalog/inventory/order phase needs `Product.sellerId` to exist first. Editing `Product`/`InventoryItem` concurrently with another branch would collide on schema.
- **Depends on:** M1.
- **Blocks:** M3 (all), M5a, M6b.
- **Can run with:** M4b Notifications (disjoint — notifications touches the event bus + `Notification` table only).
- **Recommended worktree:** `feat/seller-system`.

### M3a — Catalog V2
- **Can run in parallel:** YES.
- **Why:** Touches `products` read projections + storefront seller pages + `Product.ratingAvg/Count` columns (disjoint from search/inventory internals). Reads `Product.sellerId` (already shipped by M2).
- **Depends on:** M2.
- **Can run with:** M3b Inventory V2, M3c Search, M4a Reviews, M4b Notifications.
- **Blocks:** nothing hard (M4a Reviews uses the rating columns it adds — coordinate F2).
- **Recommended worktree:** `feat/catalog-v2`.

### M3b — Inventory V2
- **Can run in parallel:** YES.
- **Why:** Seller-scoped *reporting* over the existing ledger; touches `inventory` queries only. No schema beyond M2's `InventoryItem.sellerId`.
- **Depends on:** M2.
- **Can run with:** M3a, M3c, M4a, M4b.
- **Blocks:** nothing.
- **Recommended worktree:** `feat/inventory-v2`.

### M3c — Search
- **Can run in parallel:** YES.
- **Why:** New `search` module behind the `ProductSearch` interface; only adds a GIN index (K2, own migration) and consumes `product.*` events. No overlap with catalog-write or inventory code.
- **Depends on:** M2.
- **Can run with:** M3a, M3b, M4a, M4b.
- **Blocks:** nothing.
- **Recommended worktree:** `feat/search-v2`.

### M4a — Reviews
- **Can run in parallel:** YES.
- **Why:** New `reviews` module + `Review` table (disjoint). Soft-couples to M5a (verified flag ideally checks SubOrder) — ship gated on legacy `DELIVERED` first, tighten when M5a lands.
- **Depends on:** M2 (hard); M5a (soft — for the verified-purchase tightening).
- **Can run with:** M3 (all), M4b, M5 (all).
- **Blocks:** nothing.
- **Recommended worktree:** `feat/reviews`.

### M4b — Notifications
- **Can run in parallel:** YES (can even start alongside M2).
- **Why:** Pure consumer over the event bus + `Notification` table + `NotificationChannel` provider; touches no other domain's tables. Only needs M1's event conventions.
- **Depends on:** M1.
- **Can run with:** M2, M3 (all), M4a, M5 (all — it just gains more events to consume).
- **Blocks:** nothing.
- **Recommended worktree:** `feat/notifications`.

### M5a — Order Split (Fulfillment) — the keystone / barrier
- **Can run in parallel:** NO (synchronization barrier).
- **Why:** Restructures `Order`/`placeOrder`/the totals integration and adds `SubOrder`/`SubOrderItem`. Payments, logistics, coupons, returns, payouts all attach to `SubOrder`. Concurrent edits to checkout/order code would conflict badly.
- **Depends on:** M2.
- **Blocks:** M5b, M5c, M6a, M6b, M6c, M7a, M7b.
- **Can run with:** M3, M4 (they don't touch the order topology).
- **Recommended worktree:** `feat/order-split`.

### M5b — Payments
- **Can run in parallel:** YES (with M5c, after M5a).
- **Why:** New `payments` module behind `PaymentProvider`; touches `Payment`/`Transaction`/`Refund` (disjoint) + the checkout payment step. Independent of logistics.
- **Depends on:** M5a.
- **Can run with:** M5c Logistics, M4a, M4b.
- **Blocks:** M6a Returns, M6c Payouts.
- **Recommended worktree:** `feat/payments`.

### M5c — Logistics
- **Can run in parallel:** YES (with M5b, after M5a).
- **Why:** New `logistics` module behind `ShippingProvider`; `Shipment`/`ShipmentEvent`/`ShippingRate` (disjoint) + the checkout shipping step + per-seller `shippingTotal` integration. Independent of payments.
- **Depends on:** M5a.
- **Can run with:** M5b Payments.
- **Blocks:** nothing hard (returns reference shipments loosely).
- **Recommended worktree:** `feat/logistics`.
- **Coordination note:** M5b and M5c both edit the checkout flow (payment step / shipping step). Sequence the two checkout-UI merges (small, deliberate) even though the backend modules are independent.

### M6a — Returns
- **Can run in parallel:** YES (within M6).
- **Why:** New `returns` module + `ReturnRequest`; reuses restock primitive + refund-against-payment. Disjoint from coupons/payouts tables.
- **Depends on:** M5a + M5b.
- **Can run with:** M6b Coupons, M6c Payouts.
- **Blocks:** nothing.
- **Recommended worktree:** `feat/returns`.

### M6b — Coupons / Promotions
- **Can run in parallel:** YES (within M6).
- **Why:** New `promotions` module + `Coupon`/`CouponUsage`; integrates with the totals pipeline's `discountTotal`. Disjoint tables from returns/payouts.
- **Depends on:** M5a (per-seller totals).
- **Can run with:** M6a Returns, M6c Payouts.
- **Blocks:** nothing.
- **Recommended worktree:** `feat/promotions`.
- **Coordination note:** touches the totals pipeline (shared with M5c shipping). Both feed the per-seller totals; coordinate the pipeline integration after M5a fixes its shape.

### M6c — Seller Payouts
- **Can run in parallel:** YES (within M6).
- **Why:** New `payouts` module + `SellerPayout`; consumes `suborder.status.changed` + `payment.captured`. Disjoint from returns/coupons.
- **Depends on:** M5a + M5b.
- **Can run with:** M6a, M6b.
- **Blocks:** nothing.
- **Recommended worktree:** `feat/payouts`.

### M7a — Analytics
- **Can run in parallel:** YES (within M7).
- **Why:** Read-only matviews + `analytics` module; touches no transactional tables.
- **Depends on:** M5 (needs order/payment data to aggregate).
- **Can run with:** M7b, M7c, M7d.
- **Recommended worktree:** `feat/analytics`.

### M7b — Customer Management
- **Can run in parallel:** YES (within M7).
- **Why:** Admin read endpoints over existing `User`/`Order` relations; no schema.
- **Depends on:** M5 (order/spend data).
- **Can run with:** M7a, M7c, M7d.
- **Recommended worktree:** `feat/customers`.

### M7c — CMS + Support
- **Can run in parallel:** YES (within M7, can even start after M1).
- **Why:** New `cms`/`support` modules + disjoint tables (`ContentPage`, `SupportTicket`).
- **Depends on:** M1.
- **Can run with:** M7a, M7b, M7d (and earlier waves, schema-disjoint).
- **Recommended worktree:** `feat/cms-support`.

### M7d — NFR Hardening
- **Can run in parallel:** PARTIALLY (cross-cutting; apply mostly last).
- **Why:** Touches `main.ts`, global interceptors/filters, admin auth plumbing, accessibility across both frontends — collides with anything in flight. Best applied after feature phases settle (some pieces — throttler/helmet/CORS — already landed in M1).
- **Depends on:** spans all; finalize after M6.
- **Can run with:** M7a/b/c carefully (avoid the auth-plumbing + global-config overlap).
- **Recommended worktree:** `feat/nfr-hardening`.

---

## 2. Parallel Waves (recommended execution)

Each wave = branches that can be in flight simultaneously (different worktrees, schema-disjoint, integrated in dependency order).

| Wave | Run in parallel | Barrier after |
|---|---|---|
| **W1** | `feat/marketplace-foundation` (alone) | M1 complete |
| **W2** | `feat/seller-system` + `feat/notifications` | M2 complete (breaking migration applied) |
| **W3** | `feat/catalog-v2` + `feat/inventory-v2` + `feat/search-v2` + `feat/reviews` | (no barrier; merge as each verifies) |
| **W4** | `feat/order-split` (keystone, mostly alone; W3 leftovers may finish alongside) | **M5a barrier** |
| **W5** | `feat/payments` + `feat/logistics` | M5b/M5c checkout merges sequenced |
| **W6** | `feat/returns` + `feat/promotions` + `feat/payouts` | M6 complete |
| **W7** | `feat/analytics` + `feat/customers` + `feat/cms-support` | then `feat/nfr-hardening` last |

**Throughput note.** The serial spine is **M1 → M2 → M5a**. Everything else fans out around it. With a few parallel worktrees, W3 (4 branches) and W5/W6/W7 (2–3 branches each) compress the calendar substantially; the schedule is gated by the three serial phases, not by the feature count.

---

## 3. Consolidated Dependency Graph

```
                        Foundation (M1)
                              │
                              ▼
                       Seller System (M2)            ┌─ Notifications (M4b) ──┐  (∥ from M1)
                              │                       │                        │
        ┌─────────────────────┼───────────────────────┘                        │
        ▼                     ▼                     ▼                           │
   Catalog V2 (M3a)    Inventory V2 (M3b)     Search (M3c)    Reviews (M4a)     │  ← parallel
        └─────────────────────┴─────────────────────┴───────────┬─────────────┘
                                                                 │
                                                                 ▼
                                                        Order Split (M5a)        ← BARRIER (keystone)
                                                                 │
                                        ┌────────────────────────┼────────────────────────┐
                                        ▼                        ▼                          │
                                  Payments (M5b)          Logistics (M5c)                   │  ← parallel
                                        └───────────┬────────────┘                          │
                                                    │                                       │
                          ┌─────────────────────────┼─────────────────────────┐            │
                          ▼                         ▼                          ▼            │
                    Returns (M6a)            Coupons/Promo (M6b)         Payouts (M6c)       │  ← parallel
                          └─────────────────────────┴─────────────┬────────────┘            │
                                                                  │                         │
                          ┌────────────────────────┬──────────────┼─────────────┐          │
                          ▼                        ▼               ▼             ▼          │
                   Analytics (M7a)        Customers (M7b)   CMS/Support (M7c)  (∥)          │  ← parallel
                          └────────────────────────┴───────────────┴─────────────┘          │
                                                                  │                         │
                                                                  ▼                         │
                                                         NFR Hardening (M7d)  ◄─────────────┘  (last, cross-cutting)
```

**Matches the requested shape:**
```
Foundation
  ↓
Seller System
  ↓
Catalog + Inventory + Search        (parallel)
  ↓
Reviews + Notifications             (parallel; Notifications can start earlier)
  ↓
Orders + Payments + Logistics       (parallel; Order Split is the barrier)
  ↓
Returns + Coupons + Payouts         (parallel)
  ↓
Analytics + Customers + CMS/Support (parallel)
  ↓
NFR / Security / Observability      (cross-cutting, last)
```

**Rule:** Do not start implementation. Produce/approve the architecture documents first. Then implement **one feature slice at a time** within the approved phase order, stopping to verify before the next (RULE.md). Parallel worktrees are an option for *independent* phases only — never to bypass the M1 → M2 → M5a serial spine or the stop-and-verify discipline within a phase.
