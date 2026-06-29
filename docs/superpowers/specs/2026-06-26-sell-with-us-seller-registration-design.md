# Sell With Us — Storefront Seller Registration UI

> **Status:** Design / spec. Approved in brainstorming on 2026-06-26. No code written yet.
> **Branch / worktree:** `feat/seller-register-ui` at `.claude/worktrees/seller-register-ui` (off `main` @ fc3f892, M3 merged).
> **Surface:** `apps/storefront` only. No API or admin changes — the backend (`POST /seller/register`, `GET/PATCH /seller/me`, admin approval) already exists from M1/M2.

---

## Problem

The marketplace backend supports seller registration end-to-end (verified live: register → `PENDING_REVIEW` → admin approve → `ACTIVE`), but **no storefront UI calls `POST /seller/register`**. A user can only become a seller via direct API calls. This feature adds the customer-facing "Sell with us" flow: discover → apply → manage seller profile/KYC.

The M1 roadmap listed a storefront "Sell with us" entry as *optional* and it was never built. This closes that gap.

## Goals

- A logged-in customer can apply to become a seller from the storefront and land in the `PENDING_REVIEW` queue.
- After applying, they immediately reach their seller area **without a manual re-login** (the role-claim staleness trap is handled in-flow).
- They can view their seller status and add/edit KYC (tax + bank details) incrementally on a dedicated screen.
- Discoverable from the footer, the account page, and the header nav.

## Non-Goals (YAGNI)

- Logo file upload (URL field only).
- Editing `displayName` after registration (API allows it; not needed v1).
- Onboarding wizard / multi-step flow.
- Seller email verification.
- Any API or admin-app change. Admin approval already works in the admin app (`/sellers`, `/sellers/:id`).
- Enforcing "KYC required before approval" — the API does not enforce it and we are not adding that policy.

---

## Background: relevant backend contract (already shipped)

- **`POST /seller/register`** (`@Throttle`, any authenticated non-seller). Body `RegisterSellerDto`: `displayName` (required, 2–120), `description?` (≤2000), `logoUrl?` (http(s)), and optional KYC `gstin?/pan?/bankAccountNo?/bankIfsc?` (regex-validated, encrypted at rest). Creates a `Seller` row with status `PENDING_REVIEW`, flips `User.role → SELLER`, emits `seller.registered`. Returns a **masked** `SellerView`. `409` if the user already has a seller account.
- **`GET /seller/me`** (`@Roles(SELLER)`) → masked `SellerView` (`status`, `kycVerifiedAt`, `gstinPresent`, `panPresent`, `bankAccountLast4`, `bankIfscPresent`, …). Never returns raw KYC.
- **`PATCH /seller/me`** (`@Roles(SELLER)`) → updates profile + KYC. **Only fields present in the body are written**; absent/empty fields are a no-op (never wipes stored KYC).
- **Admin approval** (`PATCH /admin/sellers/:id/status`) is unchanged and done in the admin app.

### KYC validation patterns (from `apps/api/src/sellers/dto/register-seller.dto.ts`)

Mirrored client-side for instant feedback (API remains the source of truth):

- GSTIN: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
- PAN: `^[A-Z]{5}[0-9]{4}[A-Z]$`
- Bank account no.: `^[0-9]{9,18}$`
- IFSC: `^[A-Z]{4}0[A-Z0-9]{6}$`

---

## Architecture

Mirrors the established storefront pattern:
`page` → client form (`useAuthSubmit`-style + shared `fields`) → **route-handler proxy** (`/api/*/route.ts`) → **pure deps-injected handler** (`handlers.ts`) → `lib` API client → NestJS API. The proxy keeps `API_URL` and tokens server-only.

### New routes

| Route | Purpose | Access rule |
|---|---|---|
| `/sell` | Registration form (profile only) | Auth required. **Guest** → `/login?next=/sell`. **CUSTOMER** → show form. **SELLER** → redirect `/account/seller`. |
| `/account/seller` | Seller status + KYC management | **SELLER-only.** Guest → `/login`. CUSTOMER → `/sell`. Server-side role check (defense in depth) + `/account/seller` added to middleware `PROTECTED_PREFIXES`. |

Both pages are Server Components that resolve `getCurrentUser()` and branch on role before rendering, so the access rules are enforced server-side, not just in the client.

### New route handlers (proxies, `server-only`)

| Handler | Upstream calls | Notes |
|---|---|---|
| `POST /api/seller/register` | `POST /seller/register` → `POST /auth/refresh` → `setSession` | Auto-refresh fixes the stale-role 403 (see Data Flow). |
| `GET /api/seller/me` | `GET /seller/me` | Read masked status/KYC for `/account/seller`. Uses `authedRequest` (refresh-on-401). |
| `PATCH /api/seller/me` | `PATCH /seller/me` | Profile + KYC edits. Empty fields omitted client-side. Uses `authedRequest`. |

### New files

```
apps/storefront/src/
  app/
    sell/page.tsx                         # registration page (server component, role branch)
    account/seller/page.tsx               # seller status + KYC page (server component, SELLER gate)
    api/seller/
      route-deps.ts                       # liveRouteDeps() bound to cookies()+apiBaseUrl()
      handlers.ts                         # pure: handleSellerRegister/handleSellerUpdate/handleGetSellerMe
      handlers.test.ts
      register/route.ts                   # POST adapter
      me/route.ts                         # GET + PATCH adapter
  components/seller/
    SellerRegisterForm.tsx                # 'use client' — profile-only form
    SellerRegisterForm.test.tsx
    SellerKycForm.tsx                     # 'use client' — KYC form (client regex)
    SellerKycForm.test.tsx
    SellerStatusCard.tsx                  # presentational status + KYC-presence summary
    SellerStatusCard.test.tsx
  lib/
    seller.ts                             # types + thin API client fns
    seller.test.ts                        # incl. client-side KYC regex validators
```

### Edits to existing files

1. **`lib/api-auth.ts`** — add `'SELLER'` to the `Role` union (`'CUSTOMER' | 'ADMIN' | 'INVENTORY_MANAGER' | 'SELLER'`). Currently stale vs. the API Prisma enum; required to branch on seller state.
2. **`lib/route-protection.ts`** (+ test) — add `/account/seller` to `PROTECTED_PREFIXES`. `/sell` is *not* added (it needs finer role-based branching done in-page, not the boolean middleware gate).
3. **`components/auth/useAuthSubmit.ts`**, **`components/auth/LoginForm.tsx`**, **`app/(auth)/login/page.tsx`** — honor a `next` search param so `guest → /login?next=/sell → back to /sell` works. Read `searchParams.next`, **validate it is a relative path** (must start with `/`, not `//` — open-redirect guard), pass as `redirectTo`. Default stays `/`.
4. **Entry points:**
   - `components/layout/SiteHeaderView.tsx` — add `{ href: '/sell', label: 'Sell with us' }` to `NAV_LINKS`.
   - `components/layout/SiteFooter.tsx` — add a "Sell with us" link.
   - `app/account/page.tsx` — for `CUSTOMER`, a "Become a seller" CTA card → `/sell`; for `SELLER`, a "Manage your shop" link → `/account/seller`.

### Reused as-is

`components/auth/fields.tsx` (`TextField`, `FormError`, `SubmitButton`), `lib/session.ts` (`setSession`, `getCurrentUser`), `lib/api-authed.ts` (`authedRequest`, `liveAuthedDeps`), DESIGN.md tokens via Tailwind theme (no hardcoded hex).

---

## Data flow

### Registration (the critical path — solves the stale-role 403)

```
CUSTOMER on /sell submits { displayName, description?, logoUrl? }
  → POST /api/seller/register (proxy)
      → API POST /seller/register     # seller row PENDING_REVIEW, User.role → SELLER (DB)
      → API POST /auth/refresh        # new token pair carrying role=SELLER
      → setSession(newPair)           # httpOnly cookies updated
      → { ok: true }
  → client router.push('/account/seller') + router.refresh()
  → /account/seller renders           # SELLER claim now valid — no 403
```

**Why:** registration flips the DB role, but the caller's current JWT still says `CUSTOMER` (verified live: `GET /seller/me` returned 403 with the pre-registration token because `RolesGuard` reads the role from the token claim). Refreshing in the proxy mints a token with the new claim immediately.

### KYC edit

```
SELLER on /account/seller submits non-empty KYC fields
  → PATCH /api/seller/me (proxy, authedRequest)
      → API PATCH /seller/me          # encrypts + stores only provided fields
  → returns masked SellerView; client refreshes the status card
```

---

## Error handling

- Proxy maps `ApiAuthError` → `{ status, body: { message } }`. E.g. the API `409 "You already have a seller account"` surfaces in `FormError` (though normal routing redirects an existing seller away from `/sell` before they can submit).
- **Post-register refresh failure** (rare): registration already succeeded, so do **not** error the whole flow. The handler returns `{ ok: true, reauth: true }`; the client shows "Registered — please sign in again to access your seller area" instead of a hard error. The user's seller row exists regardless.
- KYC form: client-side regex blocks malformed input before submit; the API still re-validates. Empty fields are omitted from the PATCH body so a partial save never clears stored KYC.
- Network failure: existing "Unable to reach the server. Please try again." path from the submit hook.

---

## Testing

Unit tests (Vitest, colocated `.test.ts(x)`):

- `api/seller/handlers.test.ts` — register happy path asserts order (register → refresh → setSession); 409 maps through; refresh-failure → `{ ok: true, reauth: true }`; update omits empty fields; getMe passthrough. Injected deps, no Next runtime.
- `lib/seller.test.ts` — client fns + KYC regex validators (valid + invalid GSTIN/PAN/IFSC/bank).
- `SellerRegisterForm.test.tsx` — required `displayName`; submits; surfaces server error; redirects on success.
- `SellerKycForm.test.tsx` — client validation blocks bad input; empty fields omitted from PATCH body.
- `SellerStatusCard.test.tsx` — renders each status + KYC-presence summary.
- `route-protection.test.ts` — `/account/seller` protected; existing cases unchanged.
- `useAuthSubmit` / `LoginForm` — honors valid relative `next`; rejects non-relative/`//` `next` (open-redirect guard).

## Verification gates (RULE.md — evidence before "done")

1. `npm run lint` + `npx tsc --noEmit` (run tsc explicitly — builds can swallow tsc errors).
2. `npm test` (storefront) — full suite green.
3. `npm run build` (Next production build) passes.
4. **Live smoke vs `ecom_dev`**, fresh server start (confirm "Mapped routes" / not a stale :5000 process first): register a brand-new customer through `/sell` in the browser → land on `/account/seller` showing `PENDING_REVIEW` **without re-login** (proves auto-refresh) → add KYC via the form → confirm `panPresent` flips and `bankAccountLast4` appears → admin approves in admin app → reload shows `ACTIVE`.

---

## Risks / considerations

- **Open redirect** via the new `next` param — mitigated by validating it is a relative path starting with a single `/`.
- **Token staleness** — handled by the post-register refresh; the `{ reauth: true }` fallback covers the rare refresh failure.
- **Role union drift** — adding `'SELLER'` to `lib/api-auth.ts` keeps the storefront type aligned with the API enum; check no exhaustive `switch` on `Role` breaks (search before edit).
- **Middleware vs in-page gating** — `/account/seller` uses both (prefix + server-side role check); `/sell` uses in-page branching only (needs CUSTOMER-vs-SELLER-vs-guest distinction the boolean middleware can't express).

## Affected files (summary)

**New:** 2 pages, 3 route files, `route-deps.ts`, `handlers.ts`(+test), `lib/seller.ts`(+test), 3 components (+tests).
**Edited:** `lib/api-auth.ts`, `lib/route-protection.ts`(+test), `useAuthSubmit.ts`, `LoginForm.tsx`, `(auth)/login/page.tsx`, `SiteHeaderView.tsx`, `SiteFooter.tsx`, `account/page.tsx`.

## Suggested commit (spec)

```
docs(seller-ui): design spec for storefront "Sell with us" registration
```
