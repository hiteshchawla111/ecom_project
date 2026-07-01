# M4a — Reviews API (S1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the backend API for verified-purchase reviews + ratings — create/list reviews, an admin moderation queue, and drift-free in-transaction rating aggregates — on branch `feat/reviews`.

**Architecture:** A new `reviews` bounded context owns the `Review` table. It reads the delivered-purchase gate through an injected `OrdersService.hasDeliveredProduct` and writes the denormalized `Product.ratingAvg/ratingCount` through an injected `ProductsService.recomputeRating` (both run inside the review's transaction, so the aggregate never drifts). A `review.published` domain event fires post-commit and a listener persists a `NEW_REVIEW` notification — mirroring the existing low-stock event/listener pattern.

**Tech Stack:** NestJS 11 + TypeScript (strict), Prisma 7 (`@prisma/adapter-pg`, URLs in `prisma.config.ts`), PostgreSQL (`ecom_dev` dev / `ecom_shadow` shadow), Jest unit specs, `@nestjs/event-emitter`, `class-validator` DTOs.

## Global Constraints

- **Branch:** `feat/reviews` (already created; spec committed at `dd5182d`). No `git push` — the user lands PRs.
- **Strict TS, no `any`.** DTOs validated with `class-validator` at the boundary.
- **Migrations:** author SQL by **file-diff** and apply with `npx prisma migrate deploy` — **NEVER `migrate reset`** (`ecom_dev` is shared across parallel worktrees). Additive/non-breaking only.
- **Prisma 7:** connection URLs live in `apps/api/prisma.config.ts`, not `schema.prisma`; `PrismaClient` uses the `@prisma/adapter-pg` driver adapter (already wired in `PrismaService`).
- **Money as strings:** Prisma `Decimal` serializes to string; `ratingAvg` is `Decimal(3,2)` → returned as `string | null`.
- **Run commands from `apps/api`** with absolute paths / `npm --prefix` (shell cwd resets between tool calls). Dev DB user is `sotsys033`, no password.
- **`nest build` exits 0 despite tsc errors** — verify types with `npx tsc --noEmit`. There are 3 pre-existing spec tsc errors from M2/M3; the deliverable is **0 NEW** tsc errors.
- **Bounded-context rule (ADR-002):** `reviews` must not query the `Order`/`OrderItem` or `Product` tables directly — only via the two injected methods.
- **Verified hard gate:** `isVerified` is always `true` in M4a. "Hidden" ⇔ `deletedAt IS NOT NULL`. "Visible" ⇔ `publishedAt IS NOT NULL AND deletedAt IS NULL`. The aggregate and public list count only visible reviews.

---

## File structure

```
apps/api/
  prisma/
    schema.prisma                                  MODIFY: Review model + back-relations + NEW_REVIEW enum value
    migrations/<ts>_add_review/migration.sql        CREATE: Review table + indexes + CHECK + enum value
  src/
    reviews/
      reviews.module.ts                             CREATE
      reviews.service.ts                            CREATE  (create, listPublic, adminList, hide, unhide)
      reviews.service.spec.ts                       CREATE
      reviews.controller.ts                         CREATE  (public GET + customer POST under /products/:id/reviews)
      reviews.controller.spec.ts                    CREATE
      admin-reviews.controller.ts                   CREATE  (ADMIN moderation under /admin/reviews)
      admin-reviews.controller.spec.ts              CREATE
      reviews.events.ts                             CREATE  (REVIEW_PUBLISHED_EVENT + ReviewPublishedEvent)
      dto/create-review.dto.ts                      CREATE
      dto/list-reviews.dto.ts                        CREATE  (public: cursor + limit)
      dto/list-admin-reviews.dto.ts                  CREATE  (admin: page/pageSize + filters)
    orders/orders.service.ts                        MODIFY: add hasDeliveredProduct()
    orders/orders.service.spec.ts                   MODIFY: test hasDeliveredProduct()
    products/products.service.ts                    MODIFY: add recomputeRating()
    products/products.service.spec.ts               MODIFY: test recomputeRating()
    audit/audit-actions.ts                          MODIFY: REVIEW_HIDDEN, REVIEW_UNHIDDEN
    notifications/review.listener.ts                CREATE
    notifications/review.listener.spec.ts           CREATE
    notifications/notifications.service.ts          MODIFY: recordNewReview()
    notifications/notifications.module.ts           MODIFY: register ReviewListener
    app.module.ts                                   MODIFY: import ReviewsModule
    scripts/backfill-rating-aggregates.ts           CREATE
```

**Task order (each ends at an independently testable + committable deliverable):**
1. F1 migration + schema (`Review`, relations, `NEW_REVIEW` enum, CHECK).
2. `OrdersService.hasDeliveredProduct` (injected read).
3. `ProductsService.recomputeRating` (injected write).
4. `reviews.events.ts` + `NotificationsService.recordNewReview` + `ReviewListener`.
5. `ReviewsService` + DTOs (create + listPublic) — the domain core, TDD.
6. `ReviewsService` moderation (adminList + hide + unhide) — TDD.
7. Controllers + `ReviewsModule` wiring + `app.module` import.
8. `backfill-rating-aggregates.ts` script.
9. HTTP smoke vs `ecom_dev` + final verification.

---

### Task 1: F1 migration — `Review` table, relations, `NEW_REVIEW` enum, CHECK

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_review/migration.sql`

**Interfaces:**
- Produces: Prisma `Review` model (client type `Review`); `Product.reviews`, `User.reviews` back-relations; `NotificationType.NEW_REVIEW`.

- [ ] **Step 1: Add the `Review` model to `schema.prisma`** (place it just after the `Product` model, before `InventoryItem`):

```prisma
model Review {
  id           String    @id @default(cuid())
  product      Product   @relation(fields: [productId], references: [id])
  productId    String
  author       User      @relation(fields: [userId], references: [id])
  userId       String
  rating       Int       // 1..5 — CHECK constraint added via raw SQL in the migration
  title        String?
  body         String?
  isVerified   Boolean   @default(false)
  helpfulCount Int       @default(0)
  publishedAt  DateTime?
  deletedAt    DateTime?
  createdAt    DateTime  @default(now())

  @@unique([productId, userId])
  @@index([productId, rating])
  @@index([userId])
  @@index([publishedAt])
}
```

- [ ] **Step 2: Add back-relations.** In the `Product` model, add `reviews Review[]` (a comment already reserves it). In the `User` model, add `reviews Review[]`.

- [ ] **Step 3: Add the enum value.** In `enum NotificationType { … }` add `NEW_REVIEW` on its own line after `REFUND_REQUEST`.

- [ ] **Step 4: Generate the client + confirm no unintended drift**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx prisma generate`
Expected: "Generated Prisma Client" — no errors.

- [ ] **Step 5: Author the migration SQL by file-diff** (do NOT run `migrate dev`, which could reset). Create `apps/api/prisma/migrations/<timestamp>_add_review/migration.sql` where `<timestamp>` is a new `YYYYMMDDHHMMSS` greater than `20260624120000` (the latest existing migration). Contents:

```sql
-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'NEW_REVIEW';

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_productId_userId_key" ON "Review"("productId", "userId");
CREATE INDEX "Review_productId_rating_idx" ON "Review"("productId", "rating");
CREATE INDEX "Review_userId_idx" ON "Review"("userId");
CREATE INDEX "Review_publishedAt_idx" ON "Review"("publishedAt");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK: rating must be 1..5 (Prisma cannot express this)
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
```

> Note: `ALTER TYPE … ADD VALUE` cannot run inside a transaction block with other DDL in some Postgres versions. If `migrate deploy` fails on the enum line, split the enum `ALTER TYPE` into its own earlier-timestamped migration directory and keep the table DDL in this one. (Per `MIGRATION_PLAN.md` enum guidance.)

- [ ] **Step 6: Apply the migration to `ecom_dev`**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx prisma migrate deploy`
Expected: "1 migration applied" (or "2" if the enum was split). No reset.

- [ ] **Step 7: Verify the table + CHECK exist**

Run: `psql ecom_dev -c "\d \"Review\"" && psql ecom_dev -c "SELECT conname FROM pg_constraint WHERE conname = 'Review_rating_check';"`
Expected: table columns listed; `Review_rating_check` returned.

- [ ] **Step 8: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(reviews): F1 migration — Review table, relations, NEW_REVIEW enum, rating CHECK"
```

---

### Task 2: `OrdersService.hasDeliveredProduct` (injected delivered-gate read)

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts`
- Test: `apps/api/src/orders/orders.service.spec.ts`

**Interfaces:**
- Produces: `OrdersService.hasDeliveredProduct(userId: string, productId: string): Promise<boolean>` — `true` iff the user has an `Order` in status `DELIVERED` with an `OrderItem` for `productId`. (Already exported by `OrdersModule`.)

- [ ] **Step 1: Write the failing test.** Add to `orders.service.spec.ts` (follow the file's existing Prisma-mock style — inspect the top of the file for how `prisma` is mocked before writing):

```ts
describe('hasDeliveredProduct', () => {
  it('returns true when a DELIVERED order contains the product', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1' } as never);
    await expect(service.hasDeliveredProduct('u1', 'p1')).resolves.toBe(true);
    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        status: OrderStatus.DELIVERED,
        items: { some: { productId: 'p1' } },
      },
      select: { id: true },
    });
  });

  it('returns false when there is no matching delivered order', async () => {
    prisma.order.findFirst.mockResolvedValue(null as never);
    await expect(service.hasDeliveredProduct('u1', 'p1')).resolves.toBe(false);
  });
});
```

(Import `OrderStatus` from wherever the spec already imports it — `../orders/order-status` or `@prisma/client`; match the existing import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/orders/orders.service.spec.ts -t hasDeliveredProduct`
Expected: FAIL — `service.hasDeliveredProduct is not a function`.

- [ ] **Step 3: Implement.** Add to `OrdersService` (use the `OrderStatus` symbol the service already uses):

```ts
/**
 * Verified-purchase gate for reviews (M4a): true iff `userId` has a DELIVERED
 * order containing `productId`. Exposed as the reviews module's injected
 * orders-read so `reviews` never touches Order tables directly (ADR-002).
 * Tighten to SubOrder when M5 lands.
 */
async hasDeliveredProduct(userId: string, productId: string): Promise<boolean> {
  const order = await this.prisma.order.findFirst({
    where: {
      userId,
      status: OrderStatus.DELIVERED,
      items: { some: { productId } },
    },
    select: { id: true },
  });
  return order !== null;
}
```

> Confirm the `OrderItem` relation field name on `Order` is `items` (check the `Order` model / `ORDER_INCLUDE` in this file). If it is named differently, use that name in both the test and the impl.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/orders/orders.service.spec.ts -t hasDeliveredProduct`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.service.spec.ts
git commit -m "feat(reviews): OrdersService.hasDeliveredProduct delivered-purchase gate"
```

---

### Task 3: `ProductsService.recomputeRating` (injected in-tx aggregate write)

**Files:**
- Modify: `apps/api/src/products/products.service.ts`
- Test: `apps/api/src/products/products.service.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ProductsService.recomputeRating(productId: string, tx: Prisma.TransactionClient): Promise<void>` — recomputes `ratingAvg`/`ratingCount` over **visible** reviews (`publishedAt != null && deletedAt == null`); sets `ratingAvg = null, ratingCount = 0` when none. Runs on the caller's `tx`. (Already exported by `ProductsModule`.)

- [ ] **Step 1: Write the failing test.** Add to `products.service.spec.ts` (match its existing mock style; provide a `tx` mock with `review.aggregate` and `product.update`):

```ts
describe('recomputeRating', () => {
  it('writes avg + count over visible reviews', async () => {
    const tx = {
      review: { aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 }, _count: { _all: 2 } }) },
      product: { update: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    await service.recomputeRating('p1', tx);

    expect((tx as any).review.aggregate).toHaveBeenCalledWith({
      where: { productId: 'p1', publishedAt: { not: null }, deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });
    expect((tx as any).product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { ratingAvg: 4.5, ratingCount: 2 },
    });
  });

  it('nulls the aggregate when there are no visible reviews', async () => {
    const tx = {
      review: { aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } }) },
      product: { update: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    await service.recomputeRating('p1', tx);

    expect((tx as any).product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { ratingAvg: null, ratingCount: 0 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/products/products.service.spec.ts -t recomputeRating`
Expected: FAIL — `service.recomputeRating is not a function`.

- [ ] **Step 3: Implement.** Add to `ProductsService` (ensure `Prisma` is imported from `@prisma/client`):

```ts
/**
 * Recompute the denormalized rating aggregate for a product from its VISIBLE
 * reviews, on the caller's transaction. Kept in-tx with every review
 * create/hide/unhide so the aggregate can never drift (M4a design decision).
 */
async recomputeRating(
  productId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const agg = await tx.review.aggregate({
    where: { productId, publishedAt: { not: null }, deletedAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.product.update({
    where: { id: productId },
    data: {
      ratingAvg: agg._avg.rating,   // number | null → Prisma Decimal column
      ratingCount: agg._count._all,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/products/products.service.spec.ts -t recomputeRating`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/products/products.service.ts apps/api/src/products/products.service.spec.ts
git commit -m "feat(reviews): ProductsService.recomputeRating drift-free in-tx aggregate"
```

---

### Task 4: `review.published` event + notification (event, service method, listener)

**Files:**
- Create: `apps/api/src/reviews/reviews.events.ts`
- Modify: `apps/api/src/notifications/notifications.service.ts`
- Create: `apps/api/src/notifications/review.listener.ts`, `apps/api/src/notifications/review.listener.spec.ts`
- Modify: `apps/api/src/notifications/notifications.module.ts`

**Interfaces:**
- Produces: `REVIEW_PUBLISHED_EVENT = 'review.published'`; `ReviewPublishedEvent = { reviewId: string; productId: string; rating: number }`; `NotificationsService.recordNewReview(event: ReviewPublishedEvent): Promise<void>`; `ReviewListener` (`@OnEvent(REVIEW_PUBLISHED_EVENT)`).

- [ ] **Step 1: Create the event file** `apps/api/src/reviews/reviews.events.ts`:

```ts
/** Domain event emitted after a review is published (post-commit).
 *  Consumed by the notifications module. NOT used for the rating aggregate,
 *  which is maintained in-transaction (M4a design decision). */
export const REVIEW_PUBLISHED_EVENT = 'review.published';

export interface ReviewPublishedEvent {
  reviewId: string;
  productId: string;
  rating: number;
}
```

- [ ] **Step 2: Write the failing listener test** `apps/api/src/notifications/review.listener.spec.ts` (mirror `low-stock.listener.spec.ts` — read it first for the exact Test module + mock shape):

```ts
import { ReviewListener } from './review.listener';
import { NotificationsService } from './notifications.service';
import { REVIEW_PUBLISHED_EVENT } from '../reviews/reviews.events';

describe('ReviewListener', () => {
  it('records a NEW_REVIEW notification on the event', async () => {
    const notifications = { recordNewReview: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
    const listener = new ReviewListener(notifications);
    await listener.handle({ reviewId: 'r1', productId: 'p1', rating: 5 });
    expect(notifications.recordNewReview).toHaveBeenCalledWith({ reviewId: 'r1', productId: 'p1', rating: 5 });
  });

  it('swallows and logs a failed notification write', async () => {
    const notifications = { recordNewReview: jest.fn().mockRejectedValue(new Error('db down')) } as unknown as NotificationsService;
    const listener = new ReviewListener(notifications);
    await expect(listener.handle({ reviewId: 'r1', productId: 'p1', rating: 5 })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/notifications/review.listener.spec.ts`
Expected: FAIL — cannot find `./review.listener`.

- [ ] **Step 4: Add `recordNewReview` to `NotificationsService`** (place near `recordLowStock`; use `NotificationType.NEW_REVIEW`, `userId: null` for the admin queue — matching the low-stock admin-target convention):

```ts
async recordNewReview(event: ReviewPublishedEvent): Promise<void> {
  await this.prisma.notification.create({
    data: {
      type: NotificationType.NEW_REVIEW,
      userId: null,
      payload: { reviewId: event.reviewId, productId: event.productId, rating: event.rating },
    },
  });
}
```

Add the import at the top: `import { ReviewPublishedEvent } from '../reviews/reviews.events';` (confirm `NotificationType` is already imported).

- [ ] **Step 5: Create the listener** `apps/api/src/notifications/review.listener.ts` (copy the low-stock listener's error-logging shape):

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { REVIEW_PUBLISHED_EVENT } from '../reviews/reviews.events';
import type { ReviewPublishedEvent } from '../reviews/reviews.events';
import { NotificationsService } from './notifications.service';

/** Persists a NEW_REVIEW notification when a review is published.
 *  Notifications fire on domain events, not inline (CLAUDE.md). */
@Injectable()
export class ReviewListener {
  private readonly logger = new Logger(ReviewListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(REVIEW_PUBLISHED_EVENT)
  async handle(event: ReviewPublishedEvent): Promise<void> {
    try {
      await this.notifications.recordNewReview(event);
    } catch (err) {
      this.logger.error(
        `Failed to record NEW_REVIEW notification for review ${event.reviewId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
```

- [ ] **Step 6: Register the listener** in `notifications.module.ts` — add `ReviewListener` to the `providers` array (import it at the top). Do not add controllers.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/notifications/review.listener.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/reviews/reviews.events.ts apps/api/src/notifications
git commit -m "feat(reviews): review.published event + NEW_REVIEW notification listener"
```

---

### Task 5: `ReviewsService` core — DTOs + create + listPublic (TDD)

**Files:**
- Create: `apps/api/src/reviews/dto/create-review.dto.ts`, `apps/api/src/reviews/dto/list-reviews.dto.ts`
- Create: `apps/api/src/reviews/reviews.service.ts`, `apps/api/src/reviews/reviews.service.spec.ts`
- Modify: `apps/api/src/audit/audit-actions.ts` (add here so Task 6 can use them)

**Interfaces:**
- Consumes: `OrdersService.hasDeliveredProduct`, `ProductsService.recomputeRating`, `EventEmitter2`, `PrismaService`, `AuditService`.
- Produces:
  - `ReviewView = { id: string; rating: number; title: string | null; body: string | null; isVerified: boolean; authorName: string; publishedAt: Date | null }`
  - `ReviewSummary = { ratingAvg: string | null; ratingCount: number; distribution: Record<'1'|'2'|'3'|'4'|'5', number> }`
  - `PublicReviewList = { data: ReviewView[]; nextCursor: string | null; summary: ReviewSummary }`
  - `ReviewsService.create(productId: string, userId: string, dto: CreateReviewDto): Promise<ReviewView>`
  - `ReviewsService.listPublic(productId: string, dto: ListReviewsDto): Promise<PublicReviewList>`

- [ ] **Step 1: Create `create-review.dto.ts`:**

```ts
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;
}
```

- [ ] **Step 2: Create `list-reviews.dto.ts`:**

```ts
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Public review list: keyset pagination by publishedAt DESC, id DESC. */
export class ListReviewsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string; // opaque "<publishedAtISO>_<id>"

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
```

- [ ] **Step 3: Add audit actions** to `audit-actions.ts` (used in Task 6):

```ts
export const REVIEW_HIDDEN = 'review.hidden';
export const REVIEW_UNHIDDEN = 'review.unhidden';
```

- [ ] **Step 4: Write the failing service spec** `reviews.service.spec.ts`. Build the service with mocks for `PrismaService` (`$transaction`, `review`, ...), `OrdersService`, `ProductsService`, `EventEmitter2`, `AuditService`. Model `$transaction(cb)` as `cb(tx)` where `tx` carries `review.create`/`aggregate`/`groupBy`/`findMany`. Cover:

```ts
// create()
it('rejects with 403 when the user has no delivered order for the product', async () => {
  orders.hasDeliveredProduct.mockResolvedValue(false);
  await expect(service.create('p1', 'u1', { rating: 5 }))
    .rejects.toBeInstanceOf(ForbiddenException);
});

it('rejects with 409 when the user already reviewed the product', async () => {
  orders.hasDeliveredProduct.mockResolvedValue(true);
  tx.review.create.mockRejectedValue(prismaUniqueError()); // P2002 helper
  await expect(service.create('p1', 'u1', { rating: 5 }))
    .rejects.toBeInstanceOf(ConflictException);
});

it('creates a verified published review, recomputes the aggregate, emits post-commit', async () => {
  orders.hasDeliveredProduct.mockResolvedValue(true);
  tx.review.create.mockResolvedValue({
    id: 'r1', rating: 5, title: null, body: null, isVerified: true,
    publishedAt: new Date('2026-07-01T00:00:00Z'),
    author: { firstName: 'Ann', lastName: 'Lee', email: 'a@x.com' },
  });
  const view = await service.create('p1', 'u1', { rating: 5 });
  expect(tx.review.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ productId: 'p1', userId: 'u1', rating: 5, isVerified: true, publishedAt: expect.any(Date) }),
  }));
  expect(products.recomputeRating).toHaveBeenCalledWith('p1', tx);
  expect(emitter.emit).toHaveBeenCalledWith('review.published', { reviewId: 'r1', productId: 'p1', rating: 5 });
  expect(view).toMatchObject({ id: 'r1', authorName: 'Ann', isVerified: true });
  expect(JSON.stringify(view)).not.toContain('a@x.com'); // no PII leak
});

// listPublic()
it('returns visible reviews (publishedAt set, deletedAt null), a summary, and a nextCursor', async () => {
  // stub tx/prisma review.findMany (limit+1 rows), aggregate, groupBy(rating)
  // assert where excludes hidden, distribution maps 1..5, nextCursor set when an extra row exists
});
```

Provide a `prismaUniqueError()` helper returning `new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: 'x' } as never)`.

- [ ] **Step 5: Run the spec to verify it fails**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/reviews/reviews.service.spec.ts`
Expected: FAIL — cannot find `./reviews.service`.

- [ ] **Step 6: Implement `reviews.service.ts`.** Key points: `create` calls `hasDeliveredProduct` (throw `ForbiddenException` if false); runs `$transaction` → `tx.review.create` (catch P2002 → `ConflictException`) → `products.recomputeRating(productId, tx)`, returns the created row + author; **after** the transaction resolves, `emitter.emit(REVIEW_PUBLISHED_EVENT, {...})` (post-commit). `authorName` = `author.firstName ?? 'Anonymous'` (name only — never email). `listPublic` keyset-paginates by `publishedAt DESC, id DESC` (`take: limit+1`, slice the extra into `nextCursor`), filters `publishedAt: { not: null }, deletedAt: null`, and builds `summary` from a `review.aggregate` (`_avg.rating` → `.toFixed(2)` string or null; `_count`) and a `review.groupBy({ by: ['rating'] })` for the 1..5 distribution (fill missing stars with 0).

```ts
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { REVIEW_PUBLISHED_EVENT } from './reviews.events';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';

export interface ReviewView {
  id: string; rating: number; title: string | null; body: string | null;
  isVerified: boolean; authorName: string; publishedAt: Date | null;
}
export interface ReviewSummary {
  ratingAvg: string | null; ratingCount: number;
  distribution: Record<'1'|'2'|'3'|'4'|'5', number>;
}
export interface PublicReviewList {
  data: ReviewView[]; nextCursor: string | null; summary: ReviewSummary;
}

const AUTHOR_SELECT = { firstName: true } as const; // name only — never email (PII)

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly products: ProductsService,
    private readonly emitter: EventEmitter2,
  ) {}

  async create(productId: string, userId: string, dto: CreateReviewDto): Promise<ReviewView> {
    if (!(await this.orders.hasDeliveredProduct(userId, productId))) {
      throw new ForbiddenException('You can only review a product you have received.');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      let review;
      try {
        review = await tx.review.create({
          data: {
            productId, userId, rating: dto.rating, title: dto.title ?? null,
            body: dto.body ?? null, isVerified: true, publishedAt: new Date(),
          },
          select: { id: true, rating: true, title: true, body: true, isVerified: true, publishedAt: true, author: { select: AUTHOR_SELECT } },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException('You have already reviewed this product.');
        }
        throw err;
      }
      await this.products.recomputeRating(productId, tx);
      return review;
    });
    // Post-commit: never emit on a rolled-back write (ADR-003 deferred emit).
    this.emitter.emit(REVIEW_PUBLISHED_EVENT, { reviewId: created.id, productId, rating: created.rating });
    return this.toView(created);
  }

  async listPublic(productId: string, dto: ListReviewsDto): Promise<PublicReviewList> {
    const limit = dto.limit ?? 10;
    const where: Prisma.ReviewWhereInput = { productId, publishedAt: { not: null }, deletedAt: null };
    const cursorFilter = this.decodeCursor(dto.cursor);
    const rows = await this.prisma.review.findMany({
      where: cursorFilter ? { AND: [where, cursorFilter] } : where,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, rating: true, title: true, body: true, isVerified: true, publishedAt: true, author: { select: AUTHOR_SELECT } },
    });
    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      nextCursor = `${last.publishedAt!.toISOString()}_${last.id}`;
      rows.length = limit;
    }
    return { data: rows.map((r) => this.toView(r)), nextCursor, summary: await this.summary(productId) };
  }

  private async summary(productId: string): Promise<ReviewSummary> {
    const where: Prisma.ReviewWhereInput = { productId, publishedAt: { not: null }, deletedAt: null };
    const [agg, grouped] = await Promise.all([
      this.prisma.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.review.groupBy({ by: ['rating'], where, _count: { _all: true } }),
    ]);
    const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as Record<'1'|'2'|'3'|'4'|'5', number>;
    for (const g of grouped) distribution[String(g.rating) as '1'|'2'|'3'|'4'|'5'] = g._count._all;
    return {
      ratingAvg: agg._avg.rating === null ? null : agg._avg.rating.toFixed(2),
      ratingCount: agg._count._all,
      distribution,
    };
  }

  private decodeCursor(cursor?: string): Prisma.ReviewWhereInput | null {
    if (!cursor) return null;
    const idx = cursor.lastIndexOf('_');
    if (idx < 0) return null;
    const publishedAt = new Date(cursor.slice(0, idx));
    const id = cursor.slice(idx + 1);
    // Keyset "before" this row under publishedAt DESC, id DESC.
    return { OR: [{ publishedAt: { lt: publishedAt } }, { publishedAt, id: { lt: id } }] };
  }

  private toView(r: { id: string; rating: number; title: string | null; body: string | null; isVerified: boolean; publishedAt: Date | null; author: { firstName: string | null } }): ReviewView {
    return { id: r.id, rating: r.rating, title: r.title, body: r.body, isVerified: r.isVerified, authorName: r.author.firstName ?? 'Anonymous', publishedAt: r.publishedAt };
  }
}
```

> Verify the `User` model's name field is `firstName` (check `schema.prisma`). If the field is named differently (e.g. `name`), use that in `AUTHOR_SELECT`, `toView`, and the test.

- [ ] **Step 7: Run the spec to verify it passes**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/reviews/reviews.service.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/reviews apps/api/src/audit/audit-actions.ts
git commit -m "feat(reviews): ReviewsService create + public list (delivered-gate, one-per-product, in-tx aggregate, post-commit event)"
```

---

### Task 6: `ReviewsService` moderation — adminList + hide + unhide (TDD)

**Files:**
- Create: `apps/api/src/reviews/dto/list-admin-reviews.dto.ts`
- Modify: `apps/api/src/reviews/reviews.service.ts`, `apps/api/src/reviews/reviews.service.spec.ts`

**Interfaces:**
- Consumes: `AuditService.record`, `REVIEW_HIDDEN`, `REVIEW_UNHIDDEN`.
- Produces:
  - `AdminReviewView = ReviewView & { productId: string; userId: string; isHidden: boolean; createdAt: Date }`
  - `Paginated<T> = { data: T[]; page: number; pageSize: number; total: number }` (reuse the app's existing shape; import if one exists, else define locally)
  - `ReviewsService.adminList(dto: ListAdminReviewsDto): Promise<Paginated<AdminReviewView>>`
  - `ReviewsService.hide(id: string, actorId: string): Promise<void>`
  - `ReviewsService.unhide(id: string, actorId: string): Promise<void>`

- [ ] **Step 1: Create `list-admin-reviews.dto.ts`:**

```ts
import { IsBooleanString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListAdminReviewsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(120) productId?: string;
  @IsOptional() @IsBooleanString() isHidden?: string; // "true" | "false"
}
```

- [ ] **Step 2: Write failing specs** in `reviews.service.spec.ts`:

```ts
// hide()
it('soft-hides, recomputes the aggregate, and audits within one transaction', async () => {
  tx.review.findUnique.mockResolvedValue({ id: 'r1', productId: 'p1', deletedAt: null });
  await service.hide('r1', 'admin1');
  expect(tx.review.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { publishedAt: null, deletedAt: expect.any(Date) } });
  expect(products.recomputeRating).toHaveBeenCalledWith('p1', tx);
  expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'review.hidden', entityId: 'r1', actorId: 'admin1' }), tx);
});

it('throws 404 when hiding an unknown review', async () => {
  tx.review.findUnique.mockResolvedValue(null);
  await expect(service.hide('missing', 'admin1')).rejects.toBeInstanceOf(NotFoundException);
});

it('is a no-op success when the review is already hidden', async () => {
  tx.review.findUnique.mockResolvedValue({ id: 'r1', productId: 'p1', deletedAt: new Date() });
  await service.hide('r1', 'admin1');
  expect(tx.review.update).not.toHaveBeenCalled();
});

// unhide(): symmetric — publishedAt=now, deletedAt=null, audit 'review.unhidden', no-op when already visible.
// adminList(): isHidden='true' → where deletedAt: { not: null }; isHidden='false' → deletedAt: null; returns { data, page, pageSize, total }.
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/reviews/reviews.service.spec.ts -t 'hide|unhide|adminList'`
Expected: FAIL — methods not defined.

- [ ] **Step 4: Implement.** Inject `AuditService` into the constructor. Add:

```ts
async adminList(dto: ListAdminReviewsDto): Promise<Paginated<AdminReviewView>> {
  const page = dto.page ?? 1;
  const pageSize = dto.pageSize ?? 20;
  const where: Prisma.ReviewWhereInput = {};
  if (dto.productId) where.productId = dto.productId;
  if (dto.isHidden === 'true') where.deletedAt = { not: null };
  else if (dto.isHidden === 'false') where.deletedAt = null;
  const [rows, total] = await this.prisma.$transaction([
    this.prisma.review.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, productId: true, userId: true, rating: true, title: true, body: true, isVerified: true, publishedAt: true, deletedAt: true, createdAt: true, author: { select: AUTHOR_SELECT } },
    }),
    this.prisma.review.count({ where }),
  ]);
  return { data: rows.map((r) => ({ ...this.toView(r), productId: r.productId, userId: r.userId, isHidden: r.deletedAt !== null, createdAt: r.createdAt })), page, pageSize, total };
}

async hide(id: string, actorId: string): Promise<void> {
  await this.setHidden(id, true, actorId);
}
async unhide(id: string, actorId: string): Promise<void> {
  await this.setHidden(id, false, actorId);
}

private async setHidden(id: string, hidden: boolean, actorId: string): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    const review = await tx.review.findUnique({ where: { id }, select: { id: true, productId: true, deletedAt: true } });
    if (!review) throw new NotFoundException('Review not found.');
    const currentlyHidden = review.deletedAt !== null;
    if (currentlyHidden === hidden) return; // idempotent no-op
    await tx.review.update({
      where: { id },
      data: hidden ? { publishedAt: null, deletedAt: new Date() } : { publishedAt: new Date(), deletedAt: null },
    });
    await this.products.recomputeRating(review.productId, tx);
    await this.audit.record({ actorId, action: hidden ? REVIEW_HIDDEN : REVIEW_UNHIDDEN, entityType: 'Review', entityId: id }, tx);
  });
}
```

Add imports: `NotFoundException` from `@nestjs/common`; `AuditService` from `../audit/audit.service`; `{ REVIEW_HIDDEN, REVIEW_UNHIDDEN }` from `../audit/audit-actions`; `ListAdminReviewsDto`; define `AdminReviewView` + `Paginated<T>` (reuse an existing `Paginated` type if the codebase exports one — check `products.service.ts` / `inventory.service.ts`).

- [ ] **Step 5: Run to verify it passes**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/reviews/reviews.service.spec.ts`
Expected: PASS (all service specs).

- [ ] **Step 6: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/reviews
git commit -m "feat(reviews): admin moderation — list + soft hide/unhide (idempotent, audited, in-tx aggregate)"
```

---

### Task 7: Controllers + `ReviewsModule` + app wiring

**Files:**
- Create: `apps/api/src/reviews/reviews.controller.ts`, `apps/api/src/reviews/reviews.controller.spec.ts`
- Create: `apps/api/src/reviews/admin-reviews.controller.ts`, `apps/api/src/reviews/admin-reviews.controller.spec.ts`
- Create: `apps/api/src/reviews/reviews.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `ReviewsService` (all methods), `CurrentUser`/`AccessTokenPayload`, `Public`, `Roles`.
- Produces: HTTP routes `GET /products/:id/reviews` (public), `POST /products/:id/reviews` (customer), `GET /admin/reviews`, `PATCH /admin/reviews/:id/hide`, `PATCH /admin/reviews/:id/unhide` (ADMIN).

- [ ] **Step 1: Write the failing controller specs.** Thin specs that mock `ReviewsService` and assert each handler delegates with the right args (mirror `products.controller.spec.ts`):

```ts
// reviews.controller.spec.ts
it('POST delegates to service.create with productId, user.sub, dto', async () => {
  await controller.create('p1', { sub: 'u1' } as any, { rating: 5 });
  expect(service.create).toHaveBeenCalledWith('p1', 'u1', { rating: 5 });
});
it('GET delegates to service.listPublic', async () => {
  await controller.list('p1', { limit: 10 });
  expect(service.listPublic).toHaveBeenCalledWith('p1', { limit: 10 });
});
// admin-reviews.controller.spec.ts: hide/unhide pass (id, user.sub); list passes the dto.
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/reviews/reviews.controller.spec.ts src/reviews/admin-reviews.controller.spec.ts`
Expected: FAIL — controllers not found.

- [ ] **Step 3: Implement `reviews.controller.ts`:**

```ts
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

@Controller('products/:id/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get()
  list(@Param('id') productId: string, @Query() query: ListReviewsDto) {
    return this.reviews.listPublic(productId, query);
  }

  // Any authenticated customer; the delivered-gate is enforced in the service.
  @Post()
  create(@Param('id') productId: string, @CurrentUser() user: AccessTokenPayload, @Body() dto: CreateReviewDto) {
    return this.reviews.create(productId, user.sub, dto);
  }
}
```

- [ ] **Step 4: Implement `admin-reviews.controller.ts`:**

```ts
import { Controller, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ReviewsService } from './reviews.service';
import { ListAdminReviewsDto } from './dto/list-admin-reviews.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

@Roles(Role.ADMIN)
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Query() query: ListAdminReviewsDto) {
    return this.reviews.adminList(query);
  }

  @Patch(':id/hide')
  @HttpCode(204)
  hide(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.reviews.hide(id, user.sub);
  }

  @Patch(':id/unhide')
  @HttpCode(204)
  unhide(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.reviews.unhide(id, user.sub);
  }
}
```

- [ ] **Step 5: Create `reviews.module.ts`** (import `OrdersModule`, `ProductsModule` for the injected services; `AuditModule` for `AuditService`; `PrismaModule`; `EventEmitterModule` is global). Verify each of these modules exports the service it provides:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { AuditModule } from '../audit/audit.module';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { AdminReviewsController } from './admin-reviews.controller';

@Module({
  imports: [PrismaModule, OrdersModule, ProductsModule, AuditModule],
  controllers: [ReviewsController, AdminReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
```

- [ ] **Step 6: Register `ReviewsModule`** in `app.module.ts` (add to the `imports` array + import at top).

- [ ] **Step 7: Run the controller specs + confirm the app compiles + full suite**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/reviews && npx tsc --noEmit && npx jest`
Expected: reviews specs PASS; `tsc --noEmit` shows **only the 3 pre-existing** M2/M3 spec errors (0 new); full suite green.

- [ ] **Step 8: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/reviews apps/api/src/app.module.ts
git commit -m "feat(reviews): controllers + ReviewsModule wiring (public/customer reviews + admin moderation)"
```

---

### Task 8: `backfillRatingAggregates` maintenance script

**Files:**
- Create: `apps/api/scripts/backfill-rating-aggregates.ts`

**Interfaces:**
- Consumes: `PrismaService` recompute logic (re-implemented standalone for the script — it runs outside Nest DI).
- Produces: a runnable script that recomputes every product's `ratingAvg`/`ratingCount` from visible reviews. Idempotent.

- [ ] **Step 1: Inspect an existing script** for the Prisma-standalone + dotenv bootstrap pattern.

Run: `ls /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api/scripts && sed -n '1,30p' /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api/scripts/*.ts | head -40`
Expected: see how a script constructs `PrismaClient` with the `@prisma/adapter-pg` adapter + loads env (mirror the seed/smoke script bootstrap).

- [ ] **Step 2: Implement the script** following that bootstrap. Core logic:

```ts
// For every product id, recompute from visible reviews and overwrite.
const products = await prisma.product.findMany({ select: { id: true } });
for (const { id } of products) {
  const agg = await prisma.review.aggregate({
    where: { productId: id, publishedAt: { not: null }, deletedAt: null },
    _avg: { rating: true }, _count: { _all: true },
  });
  await prisma.product.update({
    where: { id },
    data: { ratingAvg: agg._avg.rating, ratingCount: agg._count._all },
  });
}
console.log(`Backfilled rating aggregates for ${products.length} products.`);
```

- [ ] **Step 3: Run it (no-op on empty Review table, must not throw)**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx ts-node scripts/backfill-rating-aggregates.ts`
Expected: `Backfilled rating aggregates for N products.` — exit 0. (Use the same runner the other scripts use; adjust if they use a different invocation.)

- [ ] **Step 4: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/scripts/backfill-rating-aggregates.ts
git commit -m "feat(reviews): backfill-rating-aggregates maintenance script"
```

---

### Task 9: HTTP smoke vs `ecom_dev` + final verification

**Files:**
- Create: `apps/api/scripts/smoke-reviews.sh` (mirror `apps/api/scripts/smoke-search.sh`)

**Interfaces:** none (verification only).

- [ ] **Step 1: Boot the API fresh** (avoid a stale `:5000` per the `api-smoke-stale-port-5000` memory)

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npm run start:dev` (background). Wait for "Mapped {/products/:id/reviews, GET}" + "{/admin/reviews, GET}" in the route map before smoking — proves the fresh build is serving the new routes.

- [ ] **Step 2: Write `smoke-reviews.sh`** covering, against `ecom_dev` with seeded data (register/login a customer; find a product they have a DELIVERED order for — or place+advance one via the admin status endpoint):
  - Customer with **no** delivered order → `POST /products/:id/reviews` → **403**.
  - Customer **with** a delivered order → `POST` rating 5 → **201/200**; response has `isVerified:true`, no email.
  - Same customer posts again → **409**.
  - `POST` rating 6 → **400** (DTO) ; and confirm DB CHECK by inserting rating 0 via `psql` → constraint violation.
  - `GET /products/:id/reviews` (public, no token) → the review present; `summary.ratingAvg` = "5.00", `summary.ratingCount` = 1, `distribution["5"]` = 1; `nextCursor` behavior with `limit=1` across 2 reviews.
  - Product's `ratingAvg` moved: `GET /products/:id` shows `ratingAvg:"5.00"`, `ratingCount:1`.
  - Admin `GET /admin/reviews?isHidden=false` lists it; non-admin → **403**.
  - Admin `PATCH /admin/reviews/:id/hide` → **204**; public `GET` no longer returns it; product `ratingCount` back to 0; `AuditLog` row `review.hidden` exists (`psql`). Hide again → **204** (idempotent).
  - Admin `PATCH …/unhide` → **204**; review reappears; aggregate restored; `review.unhidden` audit row.

- [ ] **Step 3: Run the smoke script**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && bash scripts/smoke-reviews.sh`
Expected: every assertion passes; script exits 0.

- [ ] **Step 4: Final gate** — full suite + types once more, and stop the dev server.

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest && npx tsc --noEmit`
Expected: full suite green; 0 new tsc errors.

- [ ] **Step 5: Commit + STOP for verification**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/scripts/smoke-reviews.sh
git commit -m "test(reviews): HTTP smoke script for the reviews API vs ecom_dev"
```

Then **stop and report** (RULE.md §1 & §6): summary of changes, files, risks/trade-offs, follow-ups (S2 storefront UI, S3 admin moderation UI; tighten gate to SubOrder at M5), and the copy-pasteable resume prompt. Do **not** start S2. Do **not** push — the user lands the PR.

---

## Verification (whole slice)

- `npx jest` (full API suite) green; reviews specs cover: delivered-gate 403, one-per-product 409, rating DTO 400 + DB CHECK, in-tx aggregate recompute (create/hide/unhide), post-commit event, public cursor list + summary/distribution, no-PII author projection, admin list filters, idempotent hide/unhide, audit rows.
- `npx tsc --noEmit`: 0 new errors (3 pre-existing M2/M3 spec errors unchanged).
- Migration applied to `ecom_dev` via `migrate deploy` (no reset); `Review` table + CHECK present.
- `smoke-reviews.sh` green vs a freshly-booted API.
- Aggregate parity: `GET /products/:id` `ratingAvg`/`ratingCount` matches the sum of visible reviews after create + hide + unhide.
```
