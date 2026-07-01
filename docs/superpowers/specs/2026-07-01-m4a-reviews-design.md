# M4a — Reviews & Ratings — Design

> **Date:** 2026-07-01
> **Phase:** M4a (of the M4 Reviews + Notifications parallel group) — `docs/IMPLEMENTATION_PLAN.md`.
> **Branch:** `feat/reviews`.
> **Status:** Approved design. Implement one slice at a time, stop-and-verify (RULE.md §1); TDD the domain-critical logic (RULE.md §4); smoke-run the real thing (RULE.md §5).

## Context

M0–M3 are complete. M4a adds verified-purchase reviews + ratings. The rating **display shell already exists** from M3a:

- `Product.ratingAvg Decimal(3,2) NULL` + `Product.ratingCount Int @default(0)` columns (F2) are already in `apps/api/prisma/schema.prisma`.
- The storefront `Product` type already carries `ratingAvg`/`ratingCount`, and `apps/storefront/src/components/catalog/RatingStars.tsx` already renders when `ratingCount > 0`.

M4a **fills** that shell: it introduces the `Review` entity (F1), the write/read API, aggregate maintenance, and the review UIs. Because M5 (SubOrders) is not yet built, the verified-purchase gate runs against **legacy `Order`/`OrderItem`** — the roadmap explicitly allows shipping gated on legacy `DELIVERED` orders first and tightening to `SubOrder` when M5 lands.

## Decisions (approved)

1. **Auto-publish, admin hides after the fact.** A review is published immediately on create (`publishedAt = now`) and counted in the aggregate. An admin moderation queue can soft-hide abusive reviews after the fact.
2. **Delivered-purchasers only (hard gate).** Only a customer with an `Order` in status `DELIVERED` containing that product may post. `isVerified` is therefore **always `true`** — there is no unverified-review branch. (Matches `DOMAIN_MODEL.md` invariant #8.)
3. **Aggregate recomputed in-transaction** (deliberate deviation from ADR-003's async aggregate). The `Product.ratingAvg/ratingCount` recompute happens in the **same transaction** as the review create/hide/unhide, so the aggregate can never drift. `review.published` still fires **post-commit**, but only to drive the `NEW_REVIEW` notification — not the aggregate. Per-product review volume is low, so in-tx recompute is cheap and drift-free; the async-aggregate cost/complexity of ADR-003 is not justified here.
4. **Bounded-context discipline (ADR-002).** The `reviews` module owns the `Review` table. It does **not** touch other contexts' tables directly:
   - The delivered-gate is an **injected orders-read**: `OrdersService.hasDeliveredProduct(userId, productId): Promise<boolean>`.
   - The aggregate write is an **injected products-write**: `ProductsService.recomputeRating(productId, tx): Promise<void>` (Catalog owns those columns).

## Architecture / boundaries

New `reviews` bounded context, mirroring existing module structure:

```
apps/api/src/reviews/
  reviews.module.ts
  reviews.controller.ts          // public GET + customer POST, routed under /products/:id/reviews
  admin-reviews.controller.ts    // ADMIN moderation, routed under /admin/reviews
  reviews.service.ts
  reviews.events.ts              // REVIEW_PUBLISHED_EVENT + payload type
  dto/create-review.dto.ts
  dto/list-reviews.dto.ts        // cursor + limit (public)
  dto/list-admin-reviews.dto.ts  // page/pageSize + productId?/isHidden? (admin)
  *.spec.ts
```

- **Delivered-gate:** injected `OrdersService.hasDeliveredProduct(userId, productId)`.
- **Aggregate:** injected `ProductsService.recomputeRating(productId, tx)` — recomputes `ratingAvg` = AVG(rating) and `ratingCount` = COUNT over **published, non-hidden** reviews (`publishedAt IS NOT NULL AND deletedAt IS NULL`); sets `ratingAvg = null`, `ratingCount = 0` when none.
- **Events:** `reviews.service` collects a deferred `review.published` payload during the create transaction and emits it **after commit** (the low-stock deferred-emit pattern in `orders.service.ts` / `inventory.service.ts`). A `NEW_REVIEW` notification listener consumes it (mirrors `low-stock.listener.ts`).
- **Audit (ADR-006):** admin hide/unhide write an `AuditLog` row via the existing `AuditService` (M1). New audit action constants `REVIEW_HIDDEN` / `REVIEW_UNHIDDEN` in `apps/api/src/audit/audit-actions.ts`.

## Data model (F1 migration)

`Review` per `DOMAIN_MODEL.md §3.2`, added to `apps/api/prisma/schema.prisma`:

```prisma
model Review {
  id           String    @id @default(cuid())
  product      Product   @relation(fields: [productId], references: [id])
  productId    String
  author       User      @relation(fields: [userId], references: [id])
  userId       String
  rating       Int       // 1..5 — CHECK added via raw SQL in the migration
  title        String?
  body         String?
  isVerified   Boolean   @default(false)   // always true in M4a (hard gate); default kept for schema symmetry
  helpfulCount Int       @default(0)        // column only in M4a; no "helpful" endpoint yet (YAGNI)
  publishedAt  DateTime?
  deletedAt    DateTime?
  createdAt    DateTime  @default(now())
  @@unique([productId, userId])            // one review per customer per product
  @@index([productId, rating])
  @@index([userId])
  @@index([publishedAt])
}
```

Add the back-relations `reviews Review[]` on `Product` (already present in the domain model) and `User`.

**Migration authoring (per the `shared-ecom-dev-cross-branch-drift` + `prisma-migrate-needs-explicit-db-user` memories):** author the migration SQL by **file-diff** and apply with `prisma migrate deploy` — **never `migrate reset`** (the `ecom_dev` DB is shared across parallel worktrees). The migration is **additive / non-breaking**. It includes a raw-SQL check the Prisma schema can't express:

```sql
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
```

F2 columns (`ratingAvg`/`ratingCount`) already exist — no schema change for them.

**Backfill.** A `backfillRatingAggregates` script (per `MIGRATION_PLAN.md`) recomputes every product's `ratingAvg`/`ratingCount` from `Review`. Idempotent (pure recompute-and-overwrite). Ships in S1 for operational completeness; a no-op on an empty `Review` table.

## API surface

### Customer / public — `reviews.controller.ts`

| Method | Route | Auth | Behavior |
|---|---|---|---|
| `POST` | `/products/:id/reviews` | Customer (JWT) | Create. **403** if no `DELIVERED` order containing product `:id`; **409** if the user already reviewed it (`@@unique`); **400** on invalid `rating` (must be int 1..5) or over-length `title`/`body`. Sets `isVerified=true`, `publishedAt=now`. Recomputes aggregate in-tx; emits `review.published` post-commit. Returns the created review. |
| `GET` | `/products/:id/reviews` | Public | Published, non-hidden reviews for the product, **cursor-paginated** by `publishedAt DESC, id DESC` (`?cursor=&limit=`, default 10 / max 50). Response: `{ data: ReviewView[], nextCursor: string \| null, summary: { ratingAvg: string \| null, ratingCount: number, distribution: { "1": n, "2": n, "3": n, "4": n, "5": n } } }`. `distribution` counts published, non-hidden reviews per star. |

`ReviewView` = `{ id, rating, title, body, isVerified, authorName, publishedAt }`. `authorName` is a **display-safe** projection of the author (first name / display name only — no email, per the M2 seller field-allowlist precedent).

### Admin moderation — `admin-reviews.controller.ts`

| Method | Route | Auth | Behavior |
|---|---|---|---|
| `GET` | `/admin/reviews` | ADMIN | All reviews incl. hidden, **offset-paginated** `{ data, page, pageSize, total }` (admin-list convention), optional `?productId=` and `?isHidden=true\|false` filters, `createdAt DESC`. |
| `PATCH` | `/admin/reviews/:id/hide` | ADMIN | Soft-hide: set `publishedAt=null`, `deletedAt=now`; recompute aggregate in-tx; audit `REVIEW_HIDDEN`. **Idempotent** (hiding an already-hidden review is a no-op success). **404** if the id doesn't exist. |
| `PATCH` | `/admin/reviews/:id/unhide` | ADMIN | Restore: set `publishedAt=now`, `deletedAt=null`; recompute aggregate in-tx; audit `REVIEW_UNHIDDEN`. Idempotent; **404** if unknown. |

**"Hidden" definition (single source of truth).** A review is *hidden* ⇔ `deletedAt IS NOT NULL` (equivalently `publishedAt IS NULL` after a hide). Public `GET` and the aggregate count only *visible* reviews (`publishedAt IS NOT NULL AND deletedAt IS NULL`). Admin `?isHidden=true` filters `deletedAt IS NOT NULL`; `?isHidden=false` filters `deletedAt IS NULL`.

**Conventions.** Public list = cursor pagination (`MIGRATION_PLAN.md` high-growth-list rule); admin list = existing offset `{page,pageSize,total}` shape. Guards: `POST` requires an authenticated customer; admin routes `@Roles(ADMIN)`. Validation via `class-validator` DTOs at the boundary. No new notification **channel** work (that's M4b) — S1 only fires the event and persists a `NEW_REVIEW` notification via the existing listener pattern.

## Events

| Event | Produced by | Consumed by | Effect |
|---|---|---|---|
| `review.published` | `reviews.service` (create, post-commit) | `NEW_REVIEW` notification listener | Persist a `NEW_REVIEW` notification (admin target), mirroring `low-stock.listener.ts`. **Not** used for the aggregate (in-tx). |

`NEW_REVIEW` is added to the `NotificationType` set (`MIGRATION_PLAN.md` K1 mentions new notification types; add just `NEW_REVIEW` here — the rest belong to M4b).

## Slice plan (API-first, 3 slices — stop & verify after each)

### S1 — Reviews API (backend) · `feat/reviews` · TDD + HTTP-smoke
- F1 migration (`Review` + raw-SQL CHECK) authored via file-diff + `migrate deploy`.
- `reviews` module: create (delivered-gate + one-per-product + in-tx aggregate recompute + deferred `review.published`), public cursor list + summary/distribution.
- `OrdersService.hasDeliveredProduct(userId, productId)` (injected read) and `ProductsService.recomputeRating(productId, tx)` (injected write).
- Admin `GET /admin/reviews` + hide/unhide (soft, audited, idempotent).
- `review.published` event + `NEW_REVIEW` notification listener + `NotificationType += NEW_REVIEW`.
- `backfillRatingAggregates` script.
- **Verify:** full API suite green; `tsc --noEmit` (0 new errors — note the 3 pre-existing M2/M3 spec tsc errors); real boot + curl smoke vs `ecom_dev`: gate 403 (no delivered order), dup 409, public list excludes hidden, aggregate moves on create + hide + unhide, distribution correct, admin filters work, audit rows written.

### S2 — Storefront reviews UI · depends on S1 merged
- Product-detail reviews section: summary (reuse `RatingStars` + distribution bars), cursor-paginated list, and a review form gated on eligibility (a "can I review?" signal derived server-side from the delivered-gate + not-yet-reviewed).
- Reuse the storefront authed-data pattern: route-handler proxy under `src/app/api/…` + server-only client + refresh-on-401 (per the storefront memories).
- **Verify:** Vitest+RTL; `next build`; browser-smoke **light + dark** (RULE.md §10).

### S3 — Admin moderation queue · depends on S1 merged
- Admin `/reviews` page: offset-paginated list (reuse `Pagination`, `StatusBadge`, `RowActionsMenu`), product link, `productId`/hidden filters; hide/unhide via the accessible `useConfirm` (`ConfirmProvider`).
- **Verify:** Vitest+RTL; `tsc -b` + `vite build`; browser-smoke **light + dark** (RULE.md §10).

**Merge order.** S1 first; S2 and S3 are independent once S1 is merged (both consume the merged API). Push only — the user lands PRs, syncs `main` between slices (per the `workflow-merge-then-resume` memory).

## Out of scope (YAGNI)

- **"Helpful" voting** — `helpfulCount` column exists (domain-model fidelity) but no endpoint/UI in M4a.
- **Editing / deleting your own review** — not in the PRD scope for M4a; a customer gets one review per product. Revisit if requested.
- **Unverified reviews / rating-only (no purchase)** — excluded by the hard gate.
- **SubOrder-based verification** — deferred until M5 lands (roadmap-sanctioned); the gate is a single injected method, so tightening it later is a one-method change.
- **Notification channel delivery (email/SMS)** — M4b.

## Risks

- **Cross-context leak.** `reviews` must not query Orders/Product tables directly — enforced via the two injected methods + review. (ADR-002.)
- **Aggregate drift.** Mitigated by in-tx recompute on every create/hide/unhide + the idempotent backfill script.
- **PII leak in `authorName`.** Mitigated by a display-safe author projection (name only), following the M2 seller field-allowlist precedent — assert in tests that email is never present.
- **Shared `ecom_dev` migration drift.** Author via file-diff + `migrate deploy`, never `migrate reset` (memory).
- **Enum add (`NEW_REVIEW`).** Postgres enum value adds are non-transactional; put the enum change in its own migration step if Prisma bundles it (per `MIGRATION_PLAN.md` enum guidance).
