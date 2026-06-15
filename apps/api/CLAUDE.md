# CLAUDE.md — API (`apps/api`)

Backend for both frontends. Imported by the root `CLAUDE.md`. Read the root for monorepo-wide product, roles, architecture, and conventions; this file covers backend specifics only.

## Stack

- **NestJS + TypeScript** — modular architecture mirroring PRD domains.
- **PostgreSQL** via **Prisma** ORM.
- Single source of truth for business rules, authorization, and the role boundary.

## Status

Not yet scaffolded. Planned scaffold: NestJS CLI + Prisma; empty domain modules per the layout below.

## Commands (aspirational — verify once scaffolded)

```bash
npm run start:dev   # watch mode (listens on PORT from .env — fixed dev port :5000)
npm run build
npm run lint
npm test            # unit; single: npm test -- <pattern>
npm run test:e2e    # e2e

npx prisma migrate dev --name <change>   # create + apply dev migration
npx prisma generate                       # regenerate client after schema edits
npx prisma studio                         # inspect data
```

## Module layout (mirror PRD domains)

Each is a NestJS module with thin controllers and business logic in services:

`auth` · `products` · `categories` · `cart` · `orders` · `inventory` · `customers` · `analytics` · `notifications`

## Critical server-side rules (the reason this app exists)

- **Authorization boundary.** Customer / Admin / Inventory Manager scopes enforced here — guard every admin/inventory route by role. Frontends are never trusted.
- **Order state machine.** `Pending → Confirmed → Processing → Shipped → Delivered`, plus `Cancelled` and (post-payment) `Refunded`. Reject invalid transitions; never accept an arbitrary status write.
- **Inventory ledger.** Track **available** vs **reserved** separately. All stock changes are append-only **movements** (type + reason), never a raw quantity mutation. Order placement reserves stock; fulfillment deducts; cancellation releases. Emit low-stock alerts when available crosses a configured threshold.
- **Cart/total pipeline.** One shared, authoritative calculation: `subtotal → discounts → taxes → shipping → grand total`. Used by both cart and order-review responses so numbers never diverge.
- **Notifications via domain events.** Use an event/listener pattern; don't inline notification sends in request handlers. Events: registration/order confirmation, shipping/delivery (customer); new orders, low-stock, refund requests (admin).
- **Analytics as aggregations.** Queries / materialized views, not hot-path recomputation.
- **Audit logging.** Log sensitive mutations (status changes, refunds, stock adjustments, role-scoped admin actions).

## Backend conventions

- Strict TS, no `any`. DTOs validated (class-validator) at the boundary; types close to their module.
- Paginate and index all list endpoints (PRD scalability requirement).
- Checkout collects shipping info and **creates an order — payment processing is future scope**, do not assume a gateway.
- Prisma schema is the data source of truth; every schema change ships with a migration.
