# M1 — Marketplace Foundation: Design Spec

> **Status:** Approved design (brainstormed 2026-06-19). Implementation roadmap entry: `docs/IMPLEMENTATION_PLAN.md` → **M1**. Reads with `MIGRATION_PLAN.md`, `DOMAIN_MODEL.md`, `ARCHITECTURE_DECISIONS.md`.
> **Branch:** `feat/marketplace-foundation` (single branch, current checkout).
> **Date:** 2026-06-19

---

## 1. Objective & Scope

Establish the marketplace's identity and platform primitives **without changing the buyer experience yet**: the `SELLER` role, the `Seller`/KYC entity, the platform seller, an active `AuditService`, baseline security hardening, and the seller registration/approval lifecycle. Everything ships behind additive, backward-compatible migrations (ADR-015); the existing single-vendor (M0) app keeps working unchanged.

**In scope:** `SELLER` role enum; `Seller` model + encrypted KYC; platform-seller seed; `AuditService` (activate the dormant `AuditLog`) wired into existing order-status/refund/stock-adjust mutations; `@nestjs/throttler` + `helmet` + env-driven CORS; J3 MFA columns (table only); `POST /seller/register`, `GET/PATCH /seller/me`; `SellerApprovedGuard` (built + unit-tested, attached in M2); admin seller management API + UI.

**Out of scope (deferred):** seller-scoped products/inventory (M2); order split (M5a); the MFA *flow*, reset-confirm TOCTOU fix, refresh-family invalidation, logging/metrics interceptor, health checks, admin httpOnly-cookie migration, accessible-modal replacement for `window.confirm` (all **M7d**); notification *display UX* (M4b — M1 only fires + persists `Notification` rows).

## 2. Decisions (from brainstorm)

- **Spec covers the whole M1 phase**, implemented one slice at a time with stop-and-verify (RULE.md §1).
- **Security hardening + audit land early** (slices 2–3), before any seller money-path or M2.
- **KYC PII is encrypted at rest now** (AES-256-GCM, app-layer), with log redaction. Not deferred.
- **`SellerApprovedGuard` is built + unit-tested in M1**, but attached to no live route until M2.
- **Reject-at-review = `SellerStatus.SUSPENDED` + stored reason** (no 5th enum value); UI labels it "Reject".
- **`SELLER` role granted at registration** (role-level access via `@Roles(SELLER)`); **active status is DB-authoritative** via the guard (ADR-005). 15m token-claim staleness accepted/documented.

## 3. Slice Map

Each slice = one stop-and-verify unit. TDD the domain-critical logic; smoke-run vs `ecom_dev` before "done".

| # | Slice | Migrations | Verifiable outcome |
|---|-------|-----------|--------------------|
| 1 | Seller domain foundation | A1 (Role+=SELLER), A2 (Seller table), A3 (platform-seller seed) | `SELLER` enum + `Seller` table exist; platform seller seeded; KYC cipher round-trips |
| 2 | AuditService activation | none | `AuditService.record()` writes `AuditLog`; wired in-tx into order-status, refund, stock-adjust |
| 3 | Security hardening | J3 (User.mfaEnabled/mfaSecret) | throttler on `/auth/*`; helmet headers; env CORS; MFA columns exist (flow deferred) |
| 4 | Seller auth + ApprovedGuard | none | `POST /seller/register` → PENDING; `GET/PATCH /seller/me`; `SellerApprovedGuard` unit-tested |
| 5 | Admin seller management API | none | `GET /admin/sellers`(+`:id`), `PATCH /admin/sellers/:id/status`; `seller.*` events; audited |
| 6 | Admin seller-management UI | none | Admin seller list + KYC review/approve/suspend, ADMIN-only |

**Sequencing rationale:** slice 1 unblocks the phase (and M2); audit (2) + hardening (3) protect routes before sensitive seller paths; seller auth (4) consumes 1–3; admin API (5) + UI (6) close the phase.

## 4. Data Model & Migrations (slices 1 & 3)

Matches `DOMAIN_MODEL.md §3.1`. `Seller` ships in M1 with only the columns it owns — **back-relations (`products`, `inventoryItems`, `subOrders`, …) are added with their FK side in the phase that introduces the FK** (M2+), to keep `prisma generate` clean.

```prisma
enum Role { CUSTOMER  ADMIN  INVENTORY_MANAGER  SELLER }   // A1: + SELLER
enum SellerStatus { PENDING_REVIEW  ACTIVE  SUSPENDED  DEACTIVATED }

model Seller {                                  // A2: new, 1:1 with User
  id             String       @id @default(cuid())
  user           User         @relation(fields: [userId], references: [id])
  userId         String       @unique
  displayName    String
  slug           String       @unique           // /seller/:slug storefront URL (M3a)
  description    String?
  logoUrl        String?
  status         SellerStatus @default(PENDING_REVIEW)
  // KYC — app-layer encrypted at rest (ciphertext stored), never logged:
  gstin          String?
  pan            String?
  bankAccountNo  String?
  bankIfsc       String?
  kycVerifiedAt  DateTime?
  commissionRate Decimal?     @db.Decimal(5,4)  // null → platform default (used M6c)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  deletedAt      DateTime?
  @@index([status]) @@index([deletedAt, createdAt])
}

model User {                                    // back-relation + J3 columns
  // ...existing...
  seller         Seller?                         // 1:1 back-relation
  mfaEnabled     Boolean  @default(false)         // J3 — flow deferred to M7d
  mfaSecret      String?                          // J3 — encrypted TOTP secret (M7d)
}
```

**Migration files** (`MIGRATION_PLAN §2.1` + pre-flight checklist):

| Step | File | Transactional? | Notes |
|------|------|----------------|-------|
| A1 | `…_role_add_seller` | **No** (own file) | Bare `ALTER TYPE "Role" ADD VALUE 'SELLER';` only. Verify `enum_range`. |
| A2 | `…_create_seller` | Yes | `Seller` table + `userId`/`slug` unique + `@@index([status])`, `@@index([deletedAt, createdAt])`. |
| J3 | `…_user_mfa_columns` | Yes | `mfaEnabled BOOLEAN NOT NULL DEFAULT false`, `mfaSecret TEXT NULL`. (Slice 3.) |

Generate `--create-only`, hand-verify SQL, then `prisma migrate dev` vs `ecom_dev` (+ `ecom_shadow`). A1 is its own migration because enum `ADD VALUE` can't run in Prisma's wrapping transaction.

**A3 — platform-seller seed** (`prisma/seed.ts`, idempotent): `upsert Seller where userId=(admin@example.com).id → { slug:'platform', displayName:'Platform', status:ACTIVE }`. Must exist before M2 (Wave B3 backfills every existing Product/InventoryItem to it). Idempotent on `userId`.

**KYC encryption util** (`apps/api/src/common/crypto/field-cipher.ts`):
- **AES-256-GCM**, key from `KYC_ENC_KEY` (32-byte base64, via `@nestjs/config`). Stored format `v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>` (versioned for rotation).
- `FieldCipherService.encryptField/decryptField` — injectable, key from config (testable with injected key). **Fail-fast:** missing key → throws on construction (never silently store plaintext).
- KYC fields encrypted on write; **never returned raw** on read. Masking convention (used by `/seller/me` and `/admin/sellers/:id`): `bankAccountNo` → last-4 (`••••1234`); `gstin`/`pan`/`bankIfsc` → boolean presence flags (`gstinPresent`, etc.). No decrypted KYC value leaves the API. Field names on a log-redaction denylist (interceptor is M7d; M1 rule = "never log KYC," enforced by review + a no-log test).
- `.env.example`: `KYC_ENC_KEY=` + note (`openssl rand -base64 32`).

**Risks:** enum-in-txn → isolated non-txn file. Missing key → fail-fast. Slug collisions → slugify + uniqueness retry (slice 4).

## 5. AuditService (slice 2)

Activate `AuditLog` (ADR-012; currently zero writes). New `@Global()` module `apps/api/src/audit/`.

```ts
interface AuditEntry {
  actorId: string | null;            // AccessTokenPayload.sub, or null for system
  action: string;                    // e.g. 'order.status.changed'
  entityType: string;                // 'Order' | 'InventoryItem' | 'Seller' | ...
  entityId?: string;
  metadata?: Prisma.InputJsonValue;  // {from,to,reason,...} — NEVER KYC/PII
}
class AuditService {
  record(entry: AuditEntry, tx: Prisma.TransactionClient): Promise<void>; // in-tx, atomic
  recordAsync(entry: AuditEntry): Promise<void>;                          // fire-and-forget, log+swallow on failure
}
```

Action constants in `audit/audit-actions.ts` (`ORDER_STATUS_CHANGED`, `REFUND_ISSUED`, `INVENTORY_ADJUSTED` now; seller actions reserved for slice 5).

**Wiring (existing M0 sites):**

| Site | Method | Audit call | Tx |
|------|--------|-----------|----|
| `orders.service.ts:364` | `updateStatus` | `ORDER_STATUS_CHANGED`, `entityType:'Order'`, `{from,to,actorRole}` | existing `$transaction` |
| `orders.service.ts` (refund path) | within `updateStatus` (`DELIVERED→REFUNDED`) | `REFUND_ISSUED`, `{amount}` | same tx as restock |
| `inventory.service.ts:225` | `adjust` | `INVENTORY_ADJUSTED`, `entityType:'InventoryItem'`, `{delta,reason,available}` | existing movement tx |

**TDD:** extend existing `updateStatus`/`adjust` tests to assert the `AuditLog` row (action/entityType/entityId/actorId) **and** that it rolls back when the surrounding mutation throws (the atomicity guarantee). **No PII in metadata** (review + denylist).

## 6. Security Hardening (slice 3)

Four independent pieces (ADR-016), all additive:

1. **`@nestjs/throttler`** — global `ThrottlerModule` (env `THROTTLE_TTL`/`THROTTLE_LIMIT`); tight `@Throttle` on `POST /auth/{login,register,password-reset/request,password-reset/confirm}` and (slice 4) `POST /seller/register`. `ThrottlerGuard` as `APP_GUARD` alongside `JwtAuthGuard`/`RolesGuard`. Test: tight metadata present; N+1 rapid login → `429`.
2. **`helmet`** — `app.use(helmet())` in `main.ts`. Default headers (API serves JSON; no custom CSP). Test: `x-content-type-options: nosniff` present.
3. **Env CORS** — replace hardcoded origins with `parseOrigins(process.env.CORS_ORIGINS)` (comma-separated allowlist, no wildcards; defaults to `:5001,:5002` when unset). `parseOrigins` is a pure unit-tested fn (`apps/api/src/common/config/cors.ts`).
4. **J3 MFA columns** — schema only (Section 4). No flow/endpoints/guard change in M1 (ADR-016 makes MFA optional → M7d). `mfaSecret` will reuse `FieldCipherService` when M7d lands.

**Config added:** `THROTTLE_TTL`, `THROTTLE_LIMIT`, `CORS_ORIGINS`, `KYC_ENC_KEY`.
**Explicitly deferred to M7d:** reset-confirm TOCTOU fix, refresh-family invalidation, logging/metrics interceptor + exception filter, health checks, admin httpOnly-cookie migration. (M1 lands *infrastructure* hardening; *flow-level* fixes stay in M7d.)

## 7. Seller Auth + SellerApprovedGuard (slice 4)

New `apps/api/src/sellers/` (controller + service + DTOs + guard).

| Route | Guard | Behavior |
|-------|-------|----------|
| `POST /seller/register` | authenticated; `@Throttle` | Create `Seller` for `actor.sub` in `PENDING_REVIEW`; KYC encrypted; slug from `displayName` (slugify + uniqueness retry); set `user.role=SELLER` **in the same tx**; emit `seller.registered`; audit `SELLER_REGISTERED`. One-per-user (`userId @unique`) → second attempt `409`. |
| `GET /seller/me` | `@Roles(SELLER)` | Own profile; KYC masked (presence flags / last-4), never raw; `404` if no seller record. |
| `PATCH /seller/me` | `@Roles(SELLER)` | Update own profile (`where userId=actor.sub`); KYC re-encrypted; **cannot self-change `status`**. |

**Role/status model (ADR-005):** role granted at registration (so `@Roles(SELLER)` reaches `/seller/me`); **`SellerApprovedGuard` gates sensitive mutations on `status===ACTIVE`** (M2). PENDING seller can log in + view profile, can't act. Token claim is stale ≤15m until refresh — accepted/documented.

**`SellerApprovedGuard`** (`sellers/guards/seller-approved.guard.ts`): reads `request.user` (after `JwtAuthGuard`), loads `Seller` by `userId`, passes iff `status===ACTIVE`; **ADMIN bypasses**; pending/suspended/deactivated/missing → `ForbiddenException`. **DB-authoritative** (live query, not JWT claim) so approval/suspension is immediate. Built + unit-tested this slice (truth table: PENDING/SUSPENDED/DEACTIVATED→blocked, ACTIVE→pass, ADMIN→bypass, no-seller→blocked); **attached to no live route until M2.**

**DTO validation:** `displayName` length-bounded; KYC optional + format-validated (GSTIN/PAN/IFSC regex, account numeric/length) on plaintext before encryption; unknown fields rejected (global `forbidNonWhitelisted`).

**Events:** `seller.registered` via existing `EventEmitter2` (low-stock pattern); consumer wired slice 5.

**TDD focus:** ownership scoping (`/seller/me` always `where userId=actor.sub`), one-per-user `409`, KYC encrypt-on-write/mask-on-read, slug uniqueness, full guard truth table.

## 8. Admin Seller Management API + UI (slices 5 & 6)

### Slice 5 — API (`sellers/admin-sellers.controller.ts` + `seller-status.ts`)

| Route | Role | Behavior |
|-------|------|----------|
| `GET /admin/sellers` | `@Roles(ADMIN)` | Paginated (`{page,pageSize,total}`); filter by `status`; rows `{id,displayName,slug,status,kycPresent,createdAt}` — no raw KYC; uses `@@index([status])`. |
| `GET /admin/sellers/:id` | `@Roles(ADMIN)` | Full profile for KYC review: identity + status + **masked KYC** (last-4 / presence flags) + `kycVerifiedAt`. No plaintext PII over the wire. |
| `PATCH /admin/sellers/:id/status` | `@Roles(ADMIN)` | `{status,reason?}`; validated transition; on `ACTIVE` set `kycVerifiedAt`; emit event; **audit in-tx**; invalid → `409`. |

**Seller status state machine** (`seller-status.ts`, pure — mirrors `orders/order-status.ts`):
```
PENDING_REVIEW → ACTIVE          (approve)
PENDING_REVIEW → SUSPENDED       (reject at review; UI labels "Reject"; reason stored)
ACTIVE         → SUSPENDED       (suspend)
SUSPENDED      → ACTIVE          (reinstate)
ACTIVE/SUSPENDED → DEACTIVATED   (terminal off-boarding)
```
Reject = `SUSPENDED` + reason (no 5th enum value; reason distinguishes rejection from later suspension in the audit log). `canTransition`/`assertTransition` unit-tested as a truth table.

**Events produced:** `seller.kyc.approved`, `seller.kyc.rejected` (status PATCH) + `seller.registered` (slice 4). **Consumed** by `notifications` (same `@OnEvent` pattern as low-stock): persist a `Notification` — admin review-queue on `seller.registered`, seller KYC-result on approve/reject. **Display UX is M4b**; M1 fires + persists only (as M0 left low-stock).

### Slice 6 — Admin UI (`apps/admin`, React+Vite, ADMIN-only)

- Route group `seller-management/`: `SellersPage` (list + status filter + shared `Pagination`) and `SellerDetailPage` (KYC review panel + approve/suspend/reject).
- Reuse `apiClient`, table density, `StatCard`/`Pagination`, `AppShell` nav (add "Sellers" link, role-gated to `ADMIN`; `INVENTORY_MANAGER` doesn't see it).
- Status with semantic color **+ text/icon** (never color-only): PENDING amber, ACTIVE green, SUSPENDED red, DEACTIVATED neutral (`DESIGN.md`).
- Confirm sensitive actions using the **existing admin confirmation pattern** (`window.confirm`); the accessible-modal swap is app-wide in M7d (avoid a one-off here → no drift).
- KYC rendered **masked** (whatever slice-5 returns) — UI never receives plaintext.
- TDD (Vitest+RTL): list renders + paginates; detail shows masked KYC; approve/suspend hits the right endpoint/payload; ADMIN-only nav gate (mirror `AppShell.inventory.test.tsx`).

**Smoke (5 & 6):** register sellers; admin lists + filters; opens one (masked KYC); approve → ACTIVE + `kycVerifiedAt` + audit + notification rows; suspend an ACTIVE one; invalid transition → `409`. Browser-verify admin `:5002` vs API `:5000`.

## 9. Acceptance Criteria (phase, from IMPLEMENTATION_PLAN.md M1)

A user can register as a seller (`PENDING_REVIEW`); admin can approve/suspend; an approved seller passes `SellerApprovedGuard`, a suspended one is blocked. Every order-status/refund/stock-adjust mutation writes an `AuditLog` row (atomically). Auth routes rate-limited; helmet headers present; CORS env-driven. KYC stored encrypted, never returned raw, never logged. All existing M0 tests green; new flows smoke-verified vs `ecom_dev`.

## 10. Execution Discipline (RULE.md)

One slice at a time, stop and verify before the next (§1). TDD domain-critical logic — KYC cipher, AuditService atomicity, `SellerApprovedGuard` truth table, seller status state machine, ownership scoping (§4). Smoke-run vs `ecom_dev` before "done" (§5). Migrations follow expand→backfill→contract; enum/`CONCURRENTLY` in their own non-transactional file. No `git push` without explicit permission (§3). Flip M1 status in `IMPLEMENTATION_PLAN.md`; on phase completion produce the §6 resume prompt.
