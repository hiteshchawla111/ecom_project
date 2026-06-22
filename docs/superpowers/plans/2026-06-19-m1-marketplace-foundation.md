# M1 — Marketplace Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish marketplace identity + platform primitives (SELLER role, Seller/KYC entity, platform seller, AuditService, security hardening, seller registration/approval) without changing the buyer experience.

**Architecture:** Evolve-in-place on the M0 NestJS API + React/Vite admin. Additive, backward-compatible migrations (expand→backfill→contract). Reuse the existing global guard chain (`JwtAuthGuard`→`RolesGuard`), `EventEmitter2` event pattern, and service-layer ownership scoping. Each slice is one stop-and-verify unit (RULE.md §1), TDD'd, smoke-run vs `ecom_dev`.

**Tech Stack:** NestJS 11, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL (`ecom_dev`/`ecom_shadow`), Jest (API), Vitest+RTL (admin), `@nestjs/throttler`, `helmet`, `@nestjs/event-emitter`, Node `crypto` (AES-256-GCM).

## Global Constraints

- **Branch:** all M1 work on `feat/marketplace-foundation` (already created, current checkout). No `git push` without explicit user permission (RULE.md §3).
- **One slice at a time:** STOP and ask the user to verify after each task below before starting the next (RULE.md §1). Tasks here are the stop points.
- **TDD:** red → green → refactor. Coverage target 80%; prioritize KYC cipher, AuditService atomicity, SellerApprovedGuard, seller status state machine, ownership scoping (RULE.md §4).
- **Strict TS, no `any`.** DTOs validated with class-validator at the boundary. Global `ValidationPipe` already has `whitelist`+`forbidNonWhitelisted`+`transform`.
- **Prisma 7:** connection URLs live in `apps/api/prisma.config.ts`, NOT `schema.prisma`. `PrismaClient` requires the `@prisma/adapter-pg` adapter (already wired in `PrismaService`). `prisma db seed` runs `ts-node prisma/seed.ts`. ⚠️ `prisma migrate dev` can reset the DB — use `--create-only` then inspect SQL before applying (see `prisma-patterns` skill).
- **Enum `ADD VALUE` cannot run in a transaction** → its own non-transactional migration file, nothing else in it.
- **DB:** `ecom_dev` (shadow `ecom_shadow`), local user `sotsys033`, no password. NEVER touch the unrelated `ecomm` DB.
- **Run:** API `npm run start:dev` on `:5000` (compiled entry is `dist/src/main.js`; `start:prod` is currently broken — use `start:dev` for smoke). Admin `:5002`, storefront `:5001`.
- **Money columns** `Decimal(12,2)`; **PKs** `cuid()`; **every FK** gets `@@index`.
- **KYC PII** (`gstin`/`pan`/`bankAccountNo`/`bankIfsc`): encrypted at rest (AES-256-GCM), never returned raw, never logged.
- **Conventions:** `OrderStatus`/enum code values UPPERCASE to match Prisma DB enums. Types live close to their module. Follow existing module shape (thin controller, logic in service).
- **Spec:** `docs/superpowers/specs/2026-06-19-m1-marketplace-foundation-design.md` is the source of truth for scope/decisions.

---

## File Structure (whole phase)

**Slice 1 — Seller domain foundation**
- Modify: `apps/api/prisma/schema.prisma` (add `SELLER` to `Role`; add `SellerStatus` enum + `Seller` model; add `seller` back-relation to `User`)
- Create: `apps/api/prisma/migrations/<ts>_role_add_seller/migration.sql` (non-txn enum)
- Create: `apps/api/prisma/migrations/<ts>_create_seller/migration.sql`
- Create: `apps/api/src/common/crypto/field-cipher.ts` (`FieldCipherService` + pure helpers)
- Create: `apps/api/src/common/crypto/field-cipher.spec.ts`
- Create: `apps/api/src/common/crypto/crypto.module.ts` (`@Global`, exports `FieldCipherService`)
- Modify: `apps/api/prisma/seed.ts` (seed platform seller)
- Modify: `apps/api/.env.example` (`KYC_ENC_KEY`)

**Slice 2 — AuditService**
- Create: `apps/api/src/audit/audit.service.ts`, `audit.service.spec.ts`, `audit.module.ts` (`@Global`), `audit-actions.ts`
- Modify: `apps/api/src/orders/orders.service.ts` (audit in `updateStatus` + refund path), `orders.service.spec.ts`
- Modify: `apps/api/src/inventory/inventory.service.ts` (audit in `adjust`), `inventory.service.spec.ts`
- Modify: `apps/api/src/app.module.ts` (import `AuditModule`)

**Slice 3 — Security hardening**
- Modify: `apps/api/src/main.ts` (helmet, env CORS)
- Modify: `apps/api/src/app.module.ts` (`ThrottlerModule` + `APP_GUARD`)
- Modify: `apps/api/src/auth/auth.controller.ts` (`@Throttle` on auth routes)
- Create: `apps/api/src/common/config/cors.ts` + `cors.spec.ts` (`parseOrigins`)
- Modify: `apps/api/prisma/schema.prisma` (`User.mfaEnabled`/`mfaSecret`)
- Create: `apps/api/prisma/migrations/<ts>_user_mfa_columns/migration.sql`
- Modify: `apps/api/.env.example` (`THROTTLE_TTL`, `THROTTLE_LIMIT`, `CORS_ORIGINS`)

**Slice 4 — Seller auth + SellerApprovedGuard**
- Create: `apps/api/src/sellers/sellers.controller.ts`, `sellers.service.ts`, `sellers.service.spec.ts`, `sellers.module.ts`
- Create: `apps/api/src/sellers/dto/register-seller.dto.ts`, `dto/update-seller.dto.ts`
- Create: `apps/api/src/sellers/guards/seller-approved.guard.ts`, `guards/seller-approved.guard.spec.ts`
- Create: `apps/api/src/sellers/seller-events.ts` (event name constants)
- Create: `apps/api/src/sellers/seller-mask.ts` + `seller-mask.spec.ts` (KYC masking projection)
- Modify: `apps/api/src/app.module.ts` (import `SellersModule`)

**Slice 5 — Admin seller management API**
- Create: `apps/api/src/sellers/admin-sellers.controller.ts`
- Create: `apps/api/src/sellers/seller-status.ts` + `seller-status.spec.ts` (pure state machine)
- Modify: `apps/api/src/sellers/sellers.service.ts` (admin list/get/updateStatus), `sellers.service.spec.ts`
- Create: `apps/api/src/notifications/seller.listener.ts` + `seller.listener.spec.ts` (consume `seller.*`)
- Modify: `apps/api/src/notifications/notifications.module.ts`

**Slice 6 — Admin seller-management UI**
- Create: `apps/admin/src/features/sellers/SellersPage.tsx` (+ `.test.tsx`), `SellerDetailPage.tsx` (+ `.test.tsx`), `sellers.api.ts`, `sellers.types.ts`
- Modify: `apps/admin/src/<router>` (add routes), `apps/admin/src/components/layout/AppShell.tsx` (+ test) (add ADMIN-only "Sellers" nav link)

> **Note:** Tasks for **Slice 1 are fully specified below.** Slices 2–6 are listed as task outlines with their deliverables and test focus; each will be expanded into bite-sized red-green-refactor steps **just before it is executed** (after the prior slice is user-verified), so the code blocks reflect the actual state of the tree at that point rather than a prediction. This is deliberate — the spec already pins the design; expanding 6 slices of exact code up front would drift the moment slice 1 lands.

---

## SLICE 1 — Seller Domain Foundation

**Deliverable:** `SELLER` role + `Seller` table exist in `ecom_dev`; platform seller seeded; `FieldCipherService` encrypts/decrypts KYC round-trip. App still boots; all M0 tests green.

**Interfaces produced (consumed by later slices):**
- `FieldCipherService.encryptField(plain: string): string` / `decryptField(stored: string): string` (slices 4–5)
- Prisma `Seller` model + `SellerStatus` enum + `Role.SELLER` (slices 4–5)
- A seeded platform `Seller` (`slug:'platform'`, `status:ACTIVE`) linked to `admin@example.com` (M2 backfill)

### Task 1.1: FieldCipher (AES-256-GCM) — pure crypto, TDD

**Files:**
- Create: `apps/api/src/common/crypto/field-cipher.ts`
- Test: `apps/api/src/common/crypto/field-cipher.spec.ts`

**Interfaces:**
- Produces: `class FieldCipherService { constructor(key: Buffer); encryptField(plain: string): string; decryptField(stored: string): string }` and a factory `createFieldCipherFromEnv(env: { KYC_ENC_KEY?: string }): FieldCipherService`.
- Stored format: `v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/common/crypto/field-cipher.spec.ts
import { FieldCipherService, createFieldCipherFromEnv } from './field-cipher';
import { randomBytes } from 'crypto';

describe('FieldCipherService', () => {
  const key = randomBytes(32);
  const cipher = new FieldCipherService(key);

  it('round-trips a plaintext value', () => {
    const enc = cipher.encryptField('22AAAAA0000A1Z5');
    expect(enc).not.toContain('22AAAAA0000A1Z5'); // ciphertext, not plaintext
    expect(enc.startsWith('v1:')).toBe(true);
    expect(cipher.decryptField(enc)).toBe('22AAAAA0000A1Z5');
  });

  it('produces a different ciphertext each call (random IV)', () => {
    expect(cipher.encryptField('x')).not.toBe(cipher.encryptField('x'));
  });

  it('rejects a tampered ciphertext (GCM auth tag)', () => {
    const enc = cipher.encryptField('secret');
    const parts = enc.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => cipher.decryptField(parts.join(':'))).toThrow();
  });

  it('fails fast when the env key is missing', () => {
    expect(() => createFieldCipherFromEnv({})).toThrow(/KYC_ENC_KEY/);
  });

  it('fails fast when the env key is the wrong length', () => {
    expect(() =>
      createFieldCipherFromEnv({ KYC_ENC_KEY: Buffer.from('short').toString('base64') }),
    ).toThrow(/32 bytes/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/api test -- field-cipher`
Expected: FAIL — cannot find module `./field-cipher`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/common/crypto/field-cipher.ts
import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';

@Injectable()
export class FieldCipherService {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error('FieldCipherService requires a 32-byte key');
    }
  }

  encryptField(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
  }

  decryptField(stored: string): string {
    const [version, ivB64, tagB64, ctB64] = stored.split(':');
    if (version !== VERSION) throw new Error(`Unsupported cipher version: ${version}`);
    const decipher = createDecipheriv(ALGO, this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  }
}

export function createFieldCipherFromEnv(env: { KYC_ENC_KEY?: string }): FieldCipherService {
  if (!env.KYC_ENC_KEY) throw new Error('KYC_ENC_KEY is required');
  const key = Buffer.from(env.KYC_ENC_KEY, 'base64');
  if (key.length !== 32) throw new Error('KYC_ENC_KEY must decode to 32 bytes (openssl rand -base64 32)');
  return new FieldCipherService(key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/api test -- field-cipher`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/crypto/field-cipher.ts apps/api/src/common/crypto/field-cipher.spec.ts
git commit -m "feat(api): AES-256-GCM field cipher for KYC PII"
```

### Task 1.2: CryptoModule (DI wiring) + env

**Files:**
- Create: `apps/api/src/common/crypto/crypto.module.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/.env` (local, gitignored — add a generated dev key so the app boots)

**Interfaces:**
- Consumes: `createFieldCipherFromEnv`, `FieldCipherService` (Task 1.1).
- Produces: a `@Global()` `CryptoModule` exporting `FieldCipherService` (injectable everywhere).

- [ ] **Step 1: Write the module** (no separate unit test — it's pure DI wiring; exercised via Task 1.1 factory test + slice-4 service tests)

```ts
// apps/api/src/common/crypto/crypto.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FieldCipherService, createFieldCipherFromEnv } from './field-cipher';

@Global()
@Module({
  providers: [
    {
      provide: FieldCipherService,
      useFactory: (config: ConfigService) =>
        createFieldCipherFromEnv({ KYC_ENC_KEY: config.get<string>('KYC_ENC_KEY') }),
      inject: [ConfigService],
    },
  ],
  exports: [FieldCipherService],
})
export class CryptoModule {}
```

- [ ] **Step 2: Add env entries**

Append to `apps/api/.env.example`:
```
# KYC field encryption (AES-256-GCM). Generate: openssl rand -base64 32
KYC_ENC_KEY=
```
Generate a real dev key and add it to `apps/api/.env`:
Run: `openssl rand -base64 32`
Then add the output as `KYC_ENC_KEY=<output>` to `apps/api/.env`.

- [ ] **Step 3: Wire into AppModule**

Add `CryptoModule` to the `imports` array in `apps/api/src/app.module.ts` (alongside the existing module imports). Confirm `ConfigModule` is already global (it is — auth reads env via `@nestjs/config`).

- [ ] **Step 4: Verify the app boots**

Run: `npm --prefix apps/api run build`
Expected: build clean.
Run: `npm --prefix apps/api run start:dev` (let it boot, confirm "Nest application successfully started", then Ctrl-C)
Expected: no `KYC_ENC_KEY` error (key present in `.env`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/crypto/crypto.module.ts apps/api/.env.example apps/api/src/app.module.ts
git commit -m "feat(api): global CryptoModule + KYC_ENC_KEY env"
```

### Task 1.3: Prisma schema — Role.SELLER + Seller model + User back-relation

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: `Role.SELLER`, `enum SellerStatus`, `model Seller`, `User.seller` back-relation.

- [ ] **Step 1: Edit the `Role` enum** — add `SELLER`:

```prisma
enum Role {
  CUSTOMER
  ADMIN
  INVENTORY_MANAGER
  SELLER
}
```

- [ ] **Step 2: Add the `SellerStatus` enum and `Seller` model** (place near the `User` model). Do NOT add `products`/`inventoryItems` back-relations — those arrive with their FK in M2.

```prisma
enum SellerStatus {
  PENDING_REVIEW
  ACTIVE
  SUSPENDED
  DEACTIVATED
}

model Seller {
  id             String       @id @default(cuid())
  user           User         @relation(fields: [userId], references: [id])
  userId         String       @unique
  displayName    String
  slug           String       @unique
  description    String?
  logoUrl        String?
  status         SellerStatus @default(PENDING_REVIEW)
  gstin          String?
  pan            String?
  bankAccountNo  String?
  bankIfsc       String?
  kycVerifiedAt  DateTime?
  commissionRate Decimal?     @db.Decimal(5, 4)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  deletedAt      DateTime?

  @@index([status])
  @@index([deletedAt, createdAt])
}
```

- [ ] **Step 3: Add the back-relation to `User`** — inside the existing `model User { ... }`, add:

```prisma
  seller Seller?
```

- [ ] **Step 4: Validate the schema (no DB write yet)**

Run: `npm --prefix apps/api exec prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀".

- [ ] **Step 5: Commit** (schema only; migrations next)

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(api): Seller model + SELLER role in schema"
```

### Task 1.4: Migration A1 — Role ADD VALUE (non-transactional, own file)

**Files:**
- Create: `apps/api/prisma/migrations/<timestamp>_role_add_seller/migration.sql`

- [ ] **Step 1: Generate the enum migration only, create-only**

Run: `npm --prefix apps/api exec prisma migrate dev -- --name role_add_seller --create-only`
Expected: a new migration dir created; NO apply yet.

- [ ] **Step 2: Inspect the generated SQL** — it MUST contain only the enum change. Open the new `migration.sql`. Expected content (Prisma may generate exactly this):

```sql
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SELLER';
```

If Prisma bundled the `Seller` table DDL into this same file, **split it**: keep only the `ALTER TYPE` line here; move the `CREATE TABLE "Seller"` + index statements into a second migration dir `<timestamp+1>_create_seller/migration.sql` (Task 1.5 expects them there). Prisma 7 emits enum `ADD VALUE` in its own statement; modern Postgres (12+) runs it outside a txn without a marker, but keep it isolated regardless.

- [ ] **Step 3: Apply migrations**

Run: `npm --prefix apps/api exec prisma migrate dev`
Expected: both migrations apply to `ecom_dev`; "Already in sync" / "applied". If it errors with the in-transaction enum error, confirm Step 2's file has ONLY the `ALTER TYPE` line.

- [ ] **Step 4: Verify the enum value landed**

Run: `psql ecom_dev -c "SELECT enum_range(NULL::\"Role\");"`
Expected: `{CUSTOMER,ADMIN,INVENTORY_MANAGER,SELLER}`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/migrations
git commit -m "feat(api): migrate Role += SELLER (non-txn enum)"
```

### Task 1.5: Migration A2 — Seller table (verify applied) + client regen

**Files:**
- Create/verify: `apps/api/prisma/migrations/<timestamp>_create_seller/migration.sql`

- [ ] **Step 1: Verify the Seller table migration exists** (created in Task 1.4 Step 2 split, or its own dir). Its SQL should be:

```sql
-- CreateEnum (if SellerStatus not already created)
CREATE TYPE "SellerStatus" AS ENUM ('PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateTable
CREATE TABLE "Seller" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "status" "SellerStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "gstin" TEXT,
    "pan" TEXT,
    "bankAccountNo" TEXT,
    "bankIfsc" TEXT,
    "kycVerifiedAt" TIMESTAMP(3),
    "commissionRate" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Seller_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Seller_userId_key" ON "Seller"("userId");
CREATE UNIQUE INDEX "Seller_slug_key" ON "Seller"("slug");
CREATE INDEX "Seller_status_idx" ON "Seller"("status");
CREATE INDEX "Seller_deletedAt_createdAt_idx" ON "Seller"("deletedAt", "createdAt");
ALTER TABLE "Seller" ADD CONSTRAINT "Seller_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npm --prefix apps/api exec prisma generate`
Expected: client regenerated; `Seller`/`SellerStatus` now available in `@prisma/client`.

- [ ] **Step 3: Verify the table exists**

Run: `psql ecom_dev -c "\d \"Seller\""`
Expected: the table with all columns + the 4 indexes.

- [ ] **Step 4: Build to confirm types**

Run: `npm --prefix apps/api run build`
Expected: clean.

- [ ] **Step 5: Commit** (if any migration files moved/changed)

```bash
git add apps/api/prisma/migrations
git commit -m "feat(api): create Seller table migration" --allow-empty
```

### Task 1.6: A3 — Seed the platform seller (idempotent)

**Files:**
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Consumes: existing `admin@example.com` user (seeded in the same file).
- Produces: one `Seller{slug:'platform', status:ACTIVE}` linked to admin.

- [ ] **Step 1: Add the platform-seller upsert** — inside `main()` in `apps/api/prisma/seed.ts`, AFTER the user upserts loop (the admin user must exist first). Import `SellerStatus`:

Change the import line to include `SellerStatus`:
```ts
import { PrismaClient, ProductStatus, Role, SellerStatus } from '@prisma/client';
```
Then add (before the final `console.log('Seed complete.')`):
```ts
  // Platform seller — the default owner that existing products/inventory backfill to (M2).
  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@example.com' },
  });
  await prisma.seller.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      displayName: 'Platform',
      slug: 'platform',
      status: SellerStatus.ACTIVE,
    },
  });
```

- [ ] **Step 2: Run the seed (idempotent)**

Run: `npm --prefix apps/api exec prisma db seed`
Expected: "Seed complete." with no error.

- [ ] **Step 3: Run it AGAIN to prove idempotency**

Run: `npm --prefix apps/api exec prisma db seed`
Expected: "Seed complete." again, still one platform seller.

- [ ] **Step 4: Verify the seeded seller**

Run: `psql ecom_dev -c "SELECT slug, status FROM \"Seller\" WHERE slug='platform';"`
Expected: one row `platform | ACTIVE`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat(api): seed platform seller (idempotent)"
```

### Task 1.7: Slice 1 smoke + M0 regression gate

- [ ] **Step 1: Full API test suite stays green**

Run: `npm --prefix apps/api test`
Expected: all M0 tests pass + the 5 new field-cipher tests. No failures.

- [ ] **Step 2: Lint + build clean**

Run: `npm --prefix apps/api run lint && npm --prefix apps/api run build`
Expected: both clean.

- [ ] **Step 3: App boots vs ecom_dev**

Run: `npm --prefix apps/api run start:dev` → confirm it starts and an existing endpoint still responds:
`curl -s http://localhost:5000/products | head -c 200` → JSON list. Ctrl-C.

- [ ] **Step 4: STOP — ask the user to verify Slice 1** before starting Slice 2 (RULE.md §1). Update `docs/IMPLEMENTATION_PLAN.md` M1 status to 🟡 if not already.

---

## SLICE 2 — AuditService (EXPANDED 2026-06-22)

**Deliverable:** `AuditService.record(entry, tx)` + `recordAsync(entry)` write `AuditLog` rows; wired into `orders.service.updateStatus` (status change + refund) and `inventory.service.adjust`, in-transaction where the mutation already runs in one. Atomicity proven by a rollback test.

**Findings from reading the real code (these shape the tasks):**
1. `orders.service.updateStatus(actor, orderId, nextStatus)` already receives `actor: AccessTokenPayload` — `actor.sub` is the audit `actorId`. It has **two paths**: a `this.prisma.$transaction(async (tx) => …)` path when the status moves stock (CANCELLED/SHIPPED/REFUNDED, via `movesStock`), and a bare `this.prisma.order.update(...)` path for non-stock transitions. **Both must audit.** REFUNDED additionally emits `REFUND_ISSUED`.
2. `inventory.service.adjust(productId, input)` does **not** currently take an actor, and `inventory.controller` calls `this.inventory.adjust(productId, dto)` without one. To record a real `actorId`, thread the actor through: controller passes `@CurrentUser()`, `adjust` gains an `actor: AccessTokenPayload` first param. `adjust`'s writes go through a private `apply(...)` helper; audit is written alongside in the same DB operation context.

**Interfaces produced:**
- `class AuditService { record(entry: AuditEntry, tx: Prisma.TransactionClient): Promise<void>; recordAsync(entry: AuditEntry): Promise<void> }`
- `interface AuditEntry { actorId: string | null; action: string; entityType: string; entityId?: string; metadata?: Prisma.InputJsonValue }`
- `audit-actions.ts`: `ORDER_STATUS_CHANGED='order.status.changed'`, `REFUND_ISSUED='refund.issued'`, `INVENTORY_ADJUSTED='inventory.adjusted'` (string consts).

### Task 2.1: AuditService + actions + module — TDD

**Files:**
- Create: `apps/api/src/audit/audit-actions.ts`, `audit/audit.service.ts`, `audit/audit.service.spec.ts`, `audit/audit.module.ts`
- Modify: `apps/api/src/app.module.ts` (import `AuditModule`)

**Interfaces produced:** as above.

- [ ] **Step 1: Write the failing test** (`audit.service.spec.ts`) — mock both a tx client and PrismaService. Assert: (a) `record` calls `tx.auditLog.create` with the entry fields; (b) `recordAsync` calls `prisma.auditLog.create`; (c) `recordAsync` swallows a create rejection (does not throw) and logs it.

```ts
import { AuditService } from './audit.service';
import { Logger } from '@nestjs/common';

describe('AuditService', () => {
  const create = jest.fn();
  const tx = { auditLog: { create } } as any;
  const prisma = { auditLog: { create } } as any;
  let service: AuditService;

  beforeEach(() => {
    create.mockReset().mockResolvedValue(undefined);
    service = new AuditService(prisma);
  });

  it('record writes an audit row on the provided tx client', async () => {
    await service.record(
      { actorId: 'u1', action: 'order.status.changed', entityType: 'Order', entityId: 'o1', metadata: { from: 'PENDING', to: 'CONFIRMED' } },
      tx,
    );
    expect(create).toHaveBeenCalledWith({
      data: { actorId: 'u1', action: 'order.status.changed', entityType: 'Order', entityId: 'o1', metadata: { from: 'PENDING', to: 'CONFIRMED' } },
    });
  });

  it('recordAsync writes via the base prisma client', async () => {
    await service.recordAsync({ actorId: null, action: 'inventory.adjusted', entityType: 'InventoryItem', entityId: 'p1' });
    expect(create).toHaveBeenCalledWith({
      data: { actorId: null, action: 'inventory.adjusted', entityType: 'InventoryItem', entityId: 'p1', metadata: undefined },
    });
  });

  it('recordAsync swallows and logs a write failure (never throws)', async () => {
    create.mockRejectedValueOnce(new Error('db down'));
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(service.recordAsync({ actorId: 'u1', action: 'x', entityType: 'Y' })).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run, verify it fails** — `npm --prefix apps/api test -- audit.service` → FAIL (module not found).

- [ ] **Step 3: Implement.** `audit-actions.ts`:

```ts
export const ORDER_STATUS_CHANGED = 'order.status.changed';
export const REFUND_ISSUED = 'refund.issued';
export const INVENTORY_ADJUSTED = 'inventory.adjusted';
```

`audit.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Write an audit row on the caller's transaction client (atomic with the mutation). */
  async record(entry: AuditEntry, tx: Prisma.TransactionClient): Promise<void> {
    await tx.auditLog.create({ data: this.toData(entry) });
  }

  /** Fire-and-forget audit write; failures are logged, never thrown. */
  async recordAsync(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: this.toData(entry) });
    } catch (err) {
      this.logger.error(`Audit write failed for ${entry.action}`, err as Error);
    }
  }

  private toData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
    return {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
    };
  }
}
```

`audit.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
```

- [ ] **Step 4: Run, verify pass** — `npm --prefix apps/api test -- audit.service` → 3 pass.

- [ ] **Step 5: Wire `AuditModule` into `app.module.ts` imports.** Build: `npm --prefix apps/api run build` → clean.

- [ ] **Step 6: Commit** — `git add apps/api/src/audit apps/api/src/app.module.ts && git commit -m "feat(api): AuditService + AuditModule (activate AuditLog)"`

### Task 2.2: Audit order status changes + refunds

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts` (inject `AuditService`; audit in BOTH paths of `updateStatus`)
- Modify: `apps/api/src/orders/orders.service.spec.ts`

**Interfaces consumed:** `AuditService.record(entry, tx)`, `ORDER_STATUS_CHANGED`, `REFUND_ISSUED`.

**Design:** In `updateStatus`, after the transition is validated:
- **Stock-moving path** (inside the existing `$transaction(async (tx) => …)`): after `tx.order.update(...)`, call `await this.audit.record({ actorId: actor.sub, action: ORDER_STATUS_CHANGED, entityType: 'Order', entityId: orderId, metadata: { from: order.status, to: nextStatus } }, tx)`. If `nextStatus === OrderStatus.REFUNDED`, ALSO `await this.audit.record({ actorId: actor.sub, action: REFUND_ISSUED, entityType: 'Order', entityId: orderId, metadata: { grandTotal: order.grandTotal } }, tx)`. Both rows are inside the tx, so they roll back if the stock op or update throws.
- **Non-stock path** (currently a bare `this.prisma.order.update(...)`): wrap it in a small `this.prisma.$transaction(async (tx) => { const u = await tx.order.update(...); await this.audit.record({ …ORDER_STATUS_CHANGED… }, tx); return u; })` so the status change + audit are atomic. (`metadata.from/to` as above.)

- [ ] **Step 1: Write the failing tests** in `orders.service.spec.ts` — using the existing mock style there. Add: (a) a non-stock transition (e.g. PENDING→CONFIRMED by ADMIN) records `ORDER_STATUS_CHANGED` with `{from:'PENDING',to:'CONFIRMED'}`; (b) a REFUNDED transition records BOTH `ORDER_STATUS_CHANGED` and `REFUND_ISSUED`; (c) when the `tx.order.update` (or a stock op) throws, the audit `record` result is rolled back — assert the surrounding call rejects and the order update did not commit (mock the tx to throw and assert the thrown error propagates). Match the existing spec's mocking of `prisma.$transaction` (it passes a `tx` mock to the callback). Run → FAIL.

- [ ] **Step 2: Implement** the two-path audit wiring described above. Inject `AuditService` via the constructor (add `private readonly audit: AuditService`). Run the new tests → PASS. Run the full `orders.service` spec → all green (no regression).

- [ ] **Step 3: Commit** — `git add apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.service.spec.ts && git commit -m "feat(api): audit order status changes + refunds (in-tx)"`

### Task 2.3: Audit stock adjustments (thread actor through)

**Files:**
- Modify: `apps/api/src/inventory/inventory.service.ts` (`adjust` gains `actor` param; audit each movement)
- Modify: `apps/api/src/inventory/inventory.controller.ts` (pass `@CurrentUser()` to `adjust`)
- Modify: `apps/api/src/inventory/inventory.service.spec.ts`
- (check) `apps/api/src/inventory/inventory.controller.spec.ts` if it exists — update the `adjust` call signature

**Interfaces consumed:** `AuditService`, `INVENTORY_ADJUSTED`.

**Design:** Change `adjust(productId, input)` → `adjust(actor: AccessTokenPayload, productId, input)`. The `apply(...)` private helper already performs the movement write; audit the adjustment after a successful `apply` for the ADDITION/DEDUCTION/ADJUSTMENT branches. Since `apply` is not shown to run in a caller-provided tx here, use `await this.audit.record(...)` if `apply` exposes its tx, otherwise `await this.audit.recordAsync({ actorId: actor.sub, action: INVENTORY_ADJUSTED, entityType: 'InventoryItem', entityId: productId, metadata: { type, delta, reason } })` after the movement commits. **Read `apply`'s implementation first** to decide in-tx vs async; prefer in-tx (`record`) if `apply` runs inside a `$transaction` you can pass through, else `recordAsync`. Controller: `inventory.controller.ts` `@Post(':productId/movements')` handler adds `@CurrentUser() user: AccessTokenPayload` and calls `this.inventory.adjust(user, productId, dto)`.

- [ ] **Step 1: Read `inventory.service.ts` `apply(...)`** to determine whether audit can be in-tx. Note the decision in the commit.

- [ ] **Step 2: Write the failing test** in `inventory.service.spec.ts` — an ADJUSTMENT (or ADDITION) records `INVENTORY_ADJUSTED` with `{type, delta, reason}` and `actorId: actor.sub`, `entityId: productId`. Update existing `adjust(...)` test calls to pass an `actor` first arg (e.g. `{ sub: 'admin1', role: Role.ADMIN, email: 'a@b.c' }`). Run → FAIL.

- [ ] **Step 3: Implement** the actor param + audit call + controller change. Run the inventory specs → green. If `inventory.controller.spec.ts` exists, update its `adjust` expectation to the new signature.

- [ ] **Step 4: Commit** — `git add apps/api/src/inventory && git commit -m "feat(api): audit stock adjustments with actor"`

### Task 2.4: Slice 2 smoke + gate

- [ ] **Step 1: Full API suite** — `npm --prefix apps/api test` → all green (M0 + audit tests). Lint + build clean.

- [ ] **Step 2: Smoke vs `ecom_dev`** — start `npm --prefix apps/api run start:dev`. As ADMIN (login `admin@example.com` / `Password123!` to get a token), drive: a non-stock order status change (`PATCH /orders/:id/status`), a stock adjustment (`POST /inventory/:productId/movements`). Then `psql ecom_dev -c 'SELECT action, "entityType", "actorId" FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 5;'` → rows for `order.status.changed` and `inventory.adjusted` with the admin's actorId. Stop the API.

- [ ] **Step 3: STOP** — ask the user to verify Slice 2 before Slice 3.

**Test focus:** atomicity (audit row rolls back with the mutation in the tx paths); no PII in metadata; actor correctly threaded into stock adjustments.

---

## SLICE 3 — Security Hardening (EXPANDED 2026-06-22)

**Deliverable:** rate limiting on `/auth/*` (and seller-register later); helmet headers; env-driven CORS; J3 MFA columns (schema + migration, no flow). All additive; existing valid traffic unchanged.

**Verified facts (shape the tasks):**
- NestJS **11** → `@nestjs/throttler` v6 (`ThrottlerModule.forRoot({ throttlers: [{ ttl, limit }] })`, `@Throttle({ default: { ttl, limit } })`).
- **`helmet` and `@nestjs/throttler` are NOT installed** — install both (user approved).
- Global guards are registered in `auth.module.ts` as `{ provide: APP_GUARD, useClass: JwtAuthGuard }` then `RolesGuard`. NestJS runs `APP_GUARD`s in registration order → **register `ThrottlerGuard` BEFORE `JwtAuthGuard`** so rate-limiting runs first/cheapest. Put the throttler `APP_GUARD` in `app.module.ts` (its imports are processed before `AuthModule`'s, so its `APP_GUARD` is registered first).
- `main.ts` currently hardcodes `app.enableCors({ origin: ['http://localhost:5001','http://localhost:5002'] })`.
- `ValidationPipe` (whitelist/forbidNonWhitelisted/transform) already global in `main.ts`.
- ⚠️ **Per-task verification MUST run `npm --prefix apps/api run lint` in addition to `npm test`** (lint slipped to the gate in Slices 1 & 2). Spec files using `as any` need the `/* eslint-disable @typescript-eslint/no-unsafe-* */` header block (project convention — see `orders.service.spec.ts`).

### Task 3.1: Env-driven CORS (`parseOrigins`) — TDD

**Files:**
- Create: `apps/api/src/common/config/cors.ts`, `apps/api/src/common/config/cors.spec.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/.env.example`

**Interfaces produced:** `parseOrigins(raw: string | undefined): string[]` — comma-separated allowlist; `undefined`/empty → default `['http://localhost:5001','http://localhost:5002']`; trims entries; drops empties; never returns `'*'` (a literal `*` entry is dropped).

- [ ] **Step 1: Write the failing test** (`cors.spec.ts`):

```ts
import { parseOrigins } from './cors';

describe('parseOrigins', () => {
  const DEFAULTS = ['http://localhost:5001', 'http://localhost:5002'];
  it('returns dev defaults when unset', () => {
    expect(parseOrigins(undefined)).toEqual(DEFAULTS);
    expect(parseOrigins('')).toEqual(DEFAULTS);
    expect(parseOrigins('   ')).toEqual(DEFAULTS);
  });
  it('splits a comma-separated list and trims', () => {
    expect(parseOrigins('https://a.com, https://b.com')).toEqual(['https://a.com', 'https://b.com']);
  });
  it('drops empty entries', () => {
    expect(parseOrigins('https://a.com,,https://b.com,')).toEqual(['https://a.com', 'https://b.com']);
  });
  it('drops a wildcard entry (no blanket CORS)', () => {
    expect(parseOrigins('*,https://a.com')).toEqual(['https://a.com']);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npm --prefix apps/api test -- cors` → FAIL (module not found).

- [ ] **Step 3: Implement** `cors.ts`:

```ts
const DEV_DEFAULTS = ['http://localhost:5001', 'http://localhost:5002'];

/** Parse a comma-separated CORS allowlist from env; dev defaults when unset; never wildcard. */
export function parseOrigins(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [...DEV_DEFAULTS];
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0 && o !== '*');
  return origins.length > 0 ? origins : [...DEV_DEFAULTS];
}
```

- [ ] **Step 4: Wire into `main.ts`** — replace the hardcoded array:

```ts
import { parseOrigins } from './common/config/cors';
// ...
app.enableCors({ origin: parseOrigins(process.env.CORS_ORIGINS) });
```

- [ ] **Step 5: `.env.example`** — append:

```
# CORS allowlist (comma-separated; no wildcards). Unset → dev defaults :5001,:5002
CORS_ORIGINS=http://localhost:5001,http://localhost:5002
```

- [ ] **Step 6: Verify** — `npm --prefix apps/api test -- cors` → pass. `npm --prefix apps/api run lint` → clean. `npm --prefix apps/api run build` → clean.

- [ ] **Step 7: Commit** — `git add apps/api/src/common/config apps/api/src/main.ts apps/api/.env.example && git commit -m "feat(api): env-driven CORS allowlist (no wildcards)"`

### Task 3.2: helmet security headers

**Files:**
- Modify: `apps/api/package.json` (+ `package-lock.json`) — `npm i helmet`
- Modify: `apps/api/src/main.ts`
- Create: `apps/api/test/security-headers.e2e-spec.ts` (or co-located integration test using `supertest` + a Nest test app)

- [ ] **Step 1: Install** — `npm --prefix apps/api i helmet` (user-approved).

- [ ] **Step 2: Write a failing integration test** that boots a minimal Nest app with `helmet()` applied and asserts a representative header. Use the existing e2e setup style (check `apps/api/test/` for the `app.e2e-spec.ts` pattern — reuse `Test.createTestingModule({ imports: [AppModule] })` + `app.use(helmet())` mirrored from `main.ts`, then `supertest(app.getHttpServer()).get('/').expect('x-content-type-options', 'nosniff')`). If a pre-existing e2e harness exists, extend it; else create `security-headers.e2e-spec.ts`. Run → FAIL (header absent).

- [ ] **Step 3: Apply helmet in `main.ts`** — `import helmet from 'helmet';` and `app.use(helmet());` BEFORE route handling (right after `NestFactory.create`). Note in a comment: API serves JSON, helmet defaults are sufficient; no custom CSP.

- [ ] **Step 4: Verify** — the e2e test passes; `npm --prefix apps/api run lint` clean; `npm --prefix apps/api run build` clean. (If the e2e runner isn't trivially available, fall back to documenting a `curl -I` check in the commit and assert via a unit test that `main.ts`'s bootstrap registers helmet — but prefer the real header assertion.)

- [ ] **Step 5: Commit** — `git add apps/api/package.json apps/api/package-lock.json apps/api/src/main.ts apps/api/test && git commit -m "feat(api): helmet security headers"`

### Task 3.3: Rate limiting (`@nestjs/throttler`)

**Files:**
- Modify: `apps/api/package.json` (+ lock) — `npm i @nestjs/throttler`
- Modify: `apps/api/src/app.module.ts` (import `ThrottlerModule`, register `ThrottlerGuard` as the FIRST `APP_GUARD`)
- Modify: `apps/api/src/auth/auth.controller.ts` (`@Throttle` tight on login/register/reset routes)
- Modify/create: an e2e test asserting the 429 trigger

- [ ] **Step 1: Install** — `npm --prefix apps/api i @nestjs/throttler` (user-approved).

- [ ] **Step 2: Configure `ThrottlerModule` in `app.module.ts`** — add to imports (env-tunable defaults):

```ts
ThrottlerModule.forRoot({
  throttlers: [{
    ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000, // v6 ttl is ms
    limit: Number(process.env.THROTTLE_LIMIT ?? 120),
  }],
}),
```
And register the guard FIRST among `APP_GUARD`s:
```ts
providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
```
(import `APP_GUARD` from `@nestjs/core`, `ThrottlerGuard`/`ThrottlerModule` from `@nestjs/throttler`.) Because `app.module` imports resolve before `AuthModule`, this `APP_GUARD` runs before `JwtAuthGuard`/`RolesGuard`.

- [ ] **Step 3: Tight `@Throttle` on auth routes** — in `auth.controller.ts`, decorate `login`, `register`, `requestReset`, `confirmReset` with `@Throttle({ default: { ttl: 60_000, limit: 10 } })` (10/min/IP — brute-force/enumeration surfaces). Import `Throttle` from `@nestjs/throttler`.

- [ ] **Step 4: e2e test** — boot the app, POST `/auth/login` with bad creds 11× rapidly; assert the 11th returns **429**. (Use the e2e harness from Task 3.2. The first 10 return 401; the throttler counts all.) Run → should pass once wired.

- [ ] **Step 5: `.env.example`** — append `THROTTLE_TTL=60` and `THROTTLE_LIMIT=120` with a note.

- [ ] **Step 6: Verify** — full `npm --prefix apps/api test` green (existing + e2e); `npm --prefix apps/api run lint` clean; `build` clean. Confirm existing `@Public()` routes still work (throttler is orthogonal to auth).

- [ ] **Step 7: Commit** — `git add apps/api/package.json apps/api/package-lock.json apps/api/src/app.module.ts apps/api/src/auth/auth.controller.ts apps/api/.env.example apps/api/test && git commit -m "feat(api): rate-limit auth routes (@nestjs/throttler)"`

### Task 3.4: J3 — User MFA columns (schema only)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add to `User`)
- Create: `apps/api/prisma/migrations/<ts>_user_mfa_columns/migration.sql`

- [ ] **Step 1: Add columns to `User` model** — `mfaEnabled Boolean @default(false)` and `mfaSecret String?`. Run `cd apps/api && npx prisma validate` → valid.

- [ ] **Step 2: Generate create-only** — `cd apps/api && npx prisma migrate dev --name user_mfa_columns --create-only`. (cwd MUST be `apps/api`.) Inspect: expect a purely additive `ALTER TABLE "User" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "mfaSecret" TEXT;` — no enum, no data change, so a normal transactional migration is fine.

- [ ] **Step 3: Apply + regen** — `cd apps/api && npx prisma migrate dev` (should NOT reset — additive; if a reset is threatened, STOP). Then `cd apps/api && npx prisma generate`.

- [ ] **Step 4: Verify** — `psql ecom_dev -c '\d "User"'` shows `mfaEnabled` (bool, default false) + `mfaSecret` (text, nullable). `npm --prefix apps/api run build` clean.

- [ ] **Step 5: Commit** — `git add apps/api/prisma && git commit -m "feat(api): User MFA columns (J3, schema only)"`

### Task 3.5: Slice 3 gate + smoke

- [ ] **Step 1: Full suite + lint + build** — `npm --prefix apps/api test` (all green), `npm --prefix apps/api run lint` (clean — verify no `git status` churn after), `npm --prefix apps/api run build` (clean).

- [ ] **Step 2: Live smoke vs `ecom_dev`** — start `npm --prefix apps/api run start:dev`. (a) `curl -I http://localhost:5000/products` → helmet headers present (e.g. `x-content-type-options: nosniff`). (b) Rapid 11× `POST /auth/login` with bad creds → the 11th returns `429`. (c) An existing app flow still works (login real admin → 200; `GET /products` → 200). Stop the API.

- [ ] **Step 3: STOP** — ask the user to verify Slice 3 before Slice 4.

**Test focus:** `parseOrigins` edge cases; helmet header present; 429 after limit; no regression to existing routes.

---

## SLICE 4 — Seller Auth + SellerApprovedGuard (task outline; expand before executing)

**Deliverable:** `POST /seller/register` (→PENDING, role→SELLER in-tx, KYC encrypted, slug unique, emits `seller.registered`, audited), `GET/PATCH /seller/me` (masked KYC, ownership-scoped), `SellerApprovedGuard` (DB-authoritative, unit-tested, attached to no live route).

**Tasks:**
- 4.1 `seller-mask.ts` + spec: project a `Seller` → DTO with `bankAccountNo`→last-4, `gstinPresent`/`panPresent`/`bankIfscPresent` booleans, NO raw KYC. Pure fn, TDD.
- 4.2 `seller-events.ts` constants (`SELLER_REGISTERED`, `SELLER_KYC_APPROVED`, `SELLER_KYC_REJECTED`).
- 4.3 `register-seller.dto.ts` + `update-seller.dto.ts` (class-validator: displayName length; KYC optional + GSTIN/PAN/IFSC regex; status NOT accepted).
- 4.4 `sellers.service.ts` `register()`: tx → create Seller (KYC via `FieldCipherService`, slugify+uniqueness retry) + set `user.role=SELLER` + `audit.record(SELLER_REGISTERED, tx)`; emit event post-commit; 409 on existing `userId`. Spec: TDD with mocked prisma/cipher/events/audit.
- 4.5 `sellers.service.ts` `getMe()`/`updateMe()`: ownership `where userId=actor.sub`, mask on read, re-encrypt KYC on update, 404 if no seller. Spec.
- 4.6 `SellerApprovedGuard` + spec: load Seller by userId; ACTIVE→pass; PENDING/SUSPENDED/DEACTIVATED/missing→Forbidden; ADMIN→bypass. (Built, not attached.)
- 4.7 `sellers.controller.ts` (`POST /seller/register` authenticated + `@Throttle`; `GET/PATCH /seller/me` `@Roles(SELLER)`); `sellers.module.ts`; import in `app.module.ts`.
- 4.8 Smoke vs `ecom_dev`: register fresh user→201 PENDING; `/seller/me` after refresh→masked; second register→409; `psql` confirms ciphertext KYC + role flip + audit row. STOP.

**Test focus:** ownership scoping, one-per-user 409, KYC encrypt-on-write/mask-on-read, slug uniqueness, guard truth table.

---

## SLICE 5 — Admin Seller Management API (task outline; expand before executing)

**Deliverable:** `GET /admin/sellers` (paginated, status filter), `GET /admin/sellers/:id` (masked KYC), `PATCH /admin/sellers/:id/status` (validated transition, sets `kycVerifiedAt` on ACTIVE, emits events, audited); notifications listener persists `Notification` rows on `seller.*`.

**Tasks:**
- 5.1 `seller-status.ts` pure state machine + spec (truth table: PENDING→ACTIVE; PENDING→SUSPENDED; ACTIVE↔SUSPENDED; ACTIVE/SUSPENDED→DEACTIVATED; everything else invalid).
- 5.2 `sellers.service` admin methods: `listSellers({page,pageSize,status})` (offset, `@@index([status])`), `getSeller(id)` (masked), `updateStatus(id,{status,reason},actor)` (assertTransition, set kycVerifiedAt on ACTIVE, audit in-tx, emit `seller.kyc.approved|rejected`). Specs.
- 5.3 `admin-sellers.controller.ts` `@Roles(ADMIN)`.
- 5.4 `notifications/seller.listener.ts` + spec: `@OnEvent('seller.registered')`→admin review-queue Notification; `@OnEvent('seller.kyc.*')`→seller-facing Notification. Mirror `low-stock.listener`. Register in `notifications.module`.
- 5.5 Smoke: register sellers; admin list+filter; get masked detail; approve→ACTIVE+kycVerifiedAt+audit+notification; invalid transition→409. STOP.

**Test focus:** state-machine truth table, masked admin reads, audit+notification on approve/reject.

---

## SLICE 6 — Admin Seller-Management UI (task outline; expand before executing)

**Deliverable:** ADMIN-only seller list + KYC-review/approve/suspend pages in `apps/admin`, against Slice 5 API.

**Tasks:**
- 6.1 `sellers.types.ts` + `sellers.api.ts` (typed client over `apiClient`: list, get, updateStatus).
- 6.2 `SellersPage.tsx` + test: table + status filter + shared `Pagination`; semantic status badge (color+text/icon); loading/error/empty states.
- 6.3 `SellerDetailPage.tsx` + test: masked KYC panel; approve/suspend/reject actions (existing confirm pattern); calls correct endpoint/payload.
- 6.4 Router wiring + `AppShell` "Sellers" link (ADMIN-only) + the role-gate test (mirror `AppShell.inventory.test.tsx`: INVENTORY_MANAGER does NOT see it).
- 6.5 Browser smoke on `:5002` vs API `:5000`: list, filter, open, approve, suspend. Admin suite green. STOP.

**Test focus:** ADMIN-only nav gate, masked-KYC render, correct endpoint calls, never color-only status.

---

## Phase Completion

When all six slices are user-verified and merged: mark **M1 ✅** in `docs/IMPLEMENTATION_PLAN.md`, confirm acceptance criteria (spec §9), and produce the RULE.md §6 copy-pasteable resume prompt pointing to **M2 — Seller System** (`feat/seller-system`, depends on M1 merged).
