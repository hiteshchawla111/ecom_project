# DOMAIN_MODEL.md — Target Marketplace Domain Model

> **Status:** Architecture document. The canonical target domain for the Flipkart-style marketplace. Schema sketches are Prisma-flavored and illustrative of *shape and relationships*; exact column-by-column migration ordering lives in `MIGRATION_PLAN.md`. Rationale for the modeling choices lives in `ARCHITECTURE_DECISIONS.md`.
>
> **Reads with:** `GAP_ANALYSIS.md` (what's missing), `MIGRATION_PLAN.md` (how to get there safely).
> **Date:** 2026-06-19

---

## 1. Bounded Contexts

The monolith stays one deployable, but the domain is organized into bounded contexts that map 1:1 to NestJS modules and would map 1:1 to microservices if extracted later (ADR-002). Each context owns its tables and publishes/consumes domain events; cross-context reads go through a service interface, cross-context *writes* go through events.

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Identity   │   │   Catalog   │   │  Inventory  │
│ User/Seller │   │ Product/Cat │   │ Item/Ledger │
│ Auth/RBAC   │   │ Review      │   │             │
└─────────────┘   └─────────────┘   └─────────────┘
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Commerce   │   │  Fulfillment│   │  Payments   │
│ Cart/Coupon │   │ SubOrder    │   │ Payment/Txn │
│ Order       │   │ Shipment    │   │ Refund/Payout│
└─────────────┘   └─────────────┘   └─────────────┘
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Notifications│  │  Analytics  │   │  Platform   │
│ Event listeners│ │ Aggregations│   │ CMS/Support  │
│ Channels    │   │ Matviews    │   │ Audit       │
└─────────────┘   └─────────────┘   └─────────────┘
```

| Context | Owns (tables) | Key invariants |
|---|---|---|
| **Identity** | `User`, `Seller`, `Address`, `RefreshToken`, `PasswordResetToken` | One `Seller` per `User`; seller acts only on own resources; role is a JWT claim, status is DB-authoritative. |
| **Catalog** | `Category`, `Product`, `ProductImage`, `Review` | Every `Product` has one `Seller`; SKU unique *per seller*; ratings aggregate maintained on publish. |
| **Inventory** | `InventoryItem`, `InventoryMovement` | Append-only ledger; `available`/`reserved` only ever change via a signed movement; never oversell. |
| **Commerce** | `Cart`, `CartItem`, `Coupon`, `CouponUsage`, `Order` | Server-authoritative totals; one cart per authed user; `Order` is the buyer-facing aggregate + payment anchor. |
| **Fulfillment** | `SubOrder`, `SubOrderItem`, `Shipment`, `ShipmentEvent`, `ShippingRate`, `ReturnRequest` | One `SubOrder` per (order, seller); `SubOrder` is the seller-facing fulfillment unit; status state machine lives here. |
| **Payments** | `Payment`, `Transaction`, `Refund`, `SellerPayout` | One `Payment` per `Order`; no raw card data; payout net = gross − commission; one payout per `SubOrder`. |
| **Notifications** | `Notification` | Fire on domain events post-commit; never inline in handlers. |
| **Analytics** | (matviews; no transactional tables) | Read-mostly; never recomputed on hot path. |
| **Platform** | `ContentPage`, `SupportTicket`, `TicketMessage`, `AuditLog` | Audit every sensitive mutation; CMS content has draft/publish lifecycle. |

---

## 2. Aggregates & The Order Topology

The defining modeling decision (ADR-006) is the **three-level order aggregate**:

```
Order ──< SubOrder ──< SubOrderItem
  │           │
  │           ├──< Shipment ──< ShipmentEvent
  │           ├──< ReturnRequest ──○ Refund
  │           └──○ SellerPayout
  │
  ├──○ Payment ──< Transaction
  │                  └──< Refund
  └──○ CouponUsage
```

- **`Order`** — the **buyer's** aggregate root. One per checkout. Holds the customer, the **cross-seller grand total**, the shipping address snapshot, the single `Payment`, applied coupon. `Order.status` is a **read-only rollup** of its SubOrders' statuses.
- **`SubOrder`** — the **seller's** aggregate root. One per (order, seller). Holds **its own** status (the state machine runs here), **its own** five-part totals snapshot, **its own** copy of the shipping snapshot (self-contained — no join needed for the seller's fulfillment queue), its items, shipments, returns, and payout.
- **`SubOrderItem`** — line snapshot (product name, unit price, line total, seller name).

This lets three sellers confirm/ship/track/refund/get-paid independently while the buyer sees one order, pays once, and gets one confirmation. The pure state machine (`orders/order-status.ts`) is reused verbatim — it just operates on `SubOrder.status` instead of `Order.status`.

---

## 3. Entities

Existing entities are marked **(existing)**; additive columns are flagged. New entities are marked **(new)**. Conventions: `cuid()` PKs, `Decimal(12,2)` money, `@@index` on every FK + sort column, soft delete via `deletedAt?` where archivable.

### 3.1 Identity

```prisma
enum Role { CUSTOMER  ADMIN  INVENTORY_MANAGER  SELLER }   // + SELLER

model User {                                   // (existing) + back-relations
  id            String  @id @default(cuid())
  email         String  @unique
  passwordHash  String
  name          String
  role          Role    @default(CUSTOMER)
  isActive      Boolean @default(true)
  // + mfaEnabled Boolean @default(false)       // optional admin MFA
  // + mfaSecret  String?                        // TOTP secret (encrypted)
  seller        Seller?                          // 1:1 (new back-relation)
  // ... existing: addresses, carts, orders, auditLogs, notifications, tokens
  // + reviews, returnRequests, couponUsages, supportTickets
  deletedAt     DateTime?
  @@index([role]) @@index([deletedAt, createdAt])
}

enum SellerStatus { PENDING_REVIEW  ACTIVE  SUSPENDED  DEACTIVATED }

model Seller {                                  // (new) 1:1 with User
  id             String       @id @default(cuid())
  user           User         @relation(fields: [userId], references: [id])
  userId         String       @unique
  displayName    String
  slug           String       @unique           // /seller/:slug storefront URL
  description    String?
  logoUrl        String?
  status         SellerStatus @default(PENDING_REVIEW)
  // KYC — app-layer encrypted; never logged
  gstin          String?
  pan            String?
  bankAccountNo  String?
  bankIfsc       String?
  kycVerifiedAt  DateTime?
  commissionRate Decimal?     @db.Decimal(5,4)  // null → platform default
  products       Product[]
  inventoryItems InventoryItem[]
  subOrders      SubOrder[]
  payouts        SellerPayout[]
  shippingRates  ShippingRate[]
  coupons        Coupon[]
  deletedAt      DateTime?
  @@index([status]) @@index([deletedAt, createdAt])
}
```

### 3.2 Catalog

```prisma
model Product {                                 // (existing) + sellerId
  id          String        @id @default(cuid())
  name        String
  sku         String                            // CHANGED: no longer globally @unique
  description String
  price       Decimal       @db.Decimal(12,2)
  salePrice   Decimal?      @db.Decimal(12,2)
  brand       String?
  status      ProductStatus @default(ACTIVE)
  categoryId  String
  sellerId    String?                           // + nullable-first, then NOT NULL+FK
  seller      Seller?       @relation(fields: [sellerId], references: [id])
  // + ratingAvg  Decimal?  @db.Decimal(3,2)    // denormalized for sort/display
  // + ratingCount Int       @default(0)
  reviews       Review[]
  subOrderItems SubOrderItem[]
  deletedAt   DateTime?
  @@unique([sku, sellerId])                      // CHANGED from @@unique([sku])
  @@index([categoryId]) @@index([status]) @@index([sellerId])
  @@index([deletedAt, createdAt])
  // + raw-SQL GIN FTS index on to_tsvector(name||' '||description)
}

model Review {                                  // (new)
  id           String   @id @default(cuid())
  product      Product  @relation(fields: [productId], references: [id])
  productId    String
  author       User     @relation(fields: [userId], references: [id])
  userId       String
  rating       Int      // 1..5 — CHECK constraint added via raw SQL in migration
  title        String?
  body         String?
  isVerified   Boolean  @default(false)         // verified purchase
  helpfulCount Int      @default(0)
  publishedAt  DateTime?
  deletedAt    DateTime?
  @@unique([productId, userId])                  // one review per customer per product
  @@index([productId, rating]) @@index([userId]) @@index([publishedAt])
}
```
`Category`, `ProductImage` unchanged.

### 3.3 Inventory

```prisma
model InventoryItem {                           // (existing) + sellerId
  id                String   @id @default(cuid())
  productId         String   @unique            // stays unique (single-seller-per-product)
  available         Int      @default(0)
  reserved          Int      @default(0)
  lowStockThreshold Int      @default(0)
  sellerId          String?                      // + denormalized for dashboard queries
  seller            Seller?  @relation(fields: [sellerId], references: [id])
  movements         InventoryMovement[]
  @@index([available]) @@index([sellerId])
}

model InventoryMovement {                        // (existing) + subOrderId
  id              String       @id @default(cuid())
  inventoryItemId String
  type            MovementType // ADDITION DEDUCTION ADJUSTMENT RESERVATION RELEASE
  quantity        Int          // signed delta
  reason          String?
  orderId         String?      // kept for back-compat
  subOrderId      String?      // + new movements reference the sub-order
  @@index([inventoryItemId, createdAt]) @@index([orderId]) @@index([subOrderId])
}
```

### 3.4 Commerce (Cart, Coupon, Order)

```prisma
model Cart { /* (existing) — unchanged; grouping by seller happens at checkout */ }
model CartItem { /* (existing) — unchanged */ }

enum DiscountType { PERCENTAGE  FIXED_AMOUNT  FREE_SHIPPING }
enum CouponScope  { PLATFORM  SELLER }

model Coupon {                                   // (new)
  id              String       @id @default(cuid())
  code            String       @unique
  discountType    DiscountType
  discountValue   Decimal      @db.Decimal(12,2)
  minOrderAmount  Decimal?     @db.Decimal(12,2)
  maxUsageCount   Int?
  usedCount       Int          @default(0)
  maxUsagePerUser Int?
  scope           CouponScope  @default(PLATFORM)
  sellerId        String?
  seller          Seller?      @relation(fields: [sellerId], references: [id])
  isActive        Boolean      @default(true)
  startsAt        DateTime
  expiresAt       DateTime?
  usages          CouponUsage[]
  @@index([code]) @@index([sellerId]) @@index([isActive, expiresAt])
}

model CouponUsage {                              // (new)
  id        String  @id @default(cuid())
  couponId  String
  userId    String
  orderId   String
  @@unique([couponId, userId, orderId])
  @@index([userId]) @@index([orderId])
}

model Order {                                    // (existing) — Order.status → rollup
  id             String      @id @default(cuid())
  userId         String
  status         OrderStatus @default(PENDING)   // now a cached rollup of SubOrders
  // cross-seller grand total snapshot
  subtotal       Decimal     @db.Decimal(12,2)
  discountTotal  Decimal     @db.Decimal(12,2) @default(0)
  taxTotal       Decimal     @db.Decimal(12,2) @default(0)
  shippingTotal  Decimal     @db.Decimal(12,2) @default(0)
  grandTotal     Decimal     @db.Decimal(12,2)
  // shipping address snapshot (ship* columns — existing)
  couponId       String?                          // + applied coupon
  subOrders      SubOrder[]                        // + new
  payment        Payment?                          // + new
  items          OrderItem[]                        // deprecated post-backfill; dropped later
  @@index([userId, createdAt]) @@index([status])
}
```

### 3.5 Fulfillment (SubOrder, Shipment, Returns, Rates)

```prisma
enum SubOrderStatus { PENDING CONFIRMED PROCESSING SHIPPED DELIVERED CANCELLED REFUNDED }

model SubOrder {                                 // (new) — seller fulfillment unit
  id            String         @id @default(cuid())
  orderId       String
  order         Order          @relation(fields: [orderId], references: [id])
  sellerId      String
  seller        Seller         @relation(fields: [sellerId], references: [id])
  status        SubOrderStatus @default(PENDING)  // state machine runs HERE
  // per-seller totals snapshot
  subtotal      Decimal  @db.Decimal(12,2)
  discountTotal Decimal  @db.Decimal(12,2) @default(0)
  taxTotal      Decimal  @db.Decimal(12,2) @default(0)
  shippingTotal Decimal  @db.Decimal(12,2) @default(0)
  grandTotal    Decimal  @db.Decimal(12,2)
  // shipping snapshot copied from Order (self-contained for seller queue)
  shipFullName  String
  shipLine1     String
  shipLine2     String?
  shipCity      String
  shipState     String
  shipCountry   String
  shipPostalCode String
  items         SubOrderItem[]
  shipments     Shipment[]
  returnRequests ReturnRequest[]
  payout        SellerPayout?
  @@index([orderId]) @@index([sellerId, status, createdAt]) @@index([status])
}

model SubOrderItem {                             // (new)
  id          String  @id @default(cuid())
  subOrderId  String
  productId   String
  productName String  // snapshot
  unitPrice   Decimal @db.Decimal(12,2)
  quantity    Int
  lineTotal   Decimal @db.Decimal(12,2)
  sellerName  String  // snapshot — self-contained
  @@index([subOrderId]) @@index([productId])
}

model ShippingRate {                             // (new)
  id            String  @id @default(cuid())
  sellerId      String
  name          String  // "Standard" / "Express"
  baseRate      Decimal @db.Decimal(12,2)
  perKgRate     Decimal? @db.Decimal(12,2)
  estimatedDays Int?
  isActive      Boolean @default(true)
  @@index([sellerId, isActive])
}

model Shipment {                                 // (new)
  id             String   @id @default(cuid())
  subOrderId     String
  carrier        String?
  trackingNumber String?
  trackingUrl    String?
  shippedAt      DateTime?
  estimatedAt    DateTime?
  deliveredAt    DateTime?
  events         ShipmentEvent[]
  @@index([subOrderId]) @@index([trackingNumber])
}

model ShipmentEvent {                            // (new)
  id          String   @id @default(cuid())
  shipmentId  String
  status      String
  location    String?
  description String?
  occurredAt  DateTime
  @@index([shipmentId, occurredAt])
}

enum ReturnStatus { REQUESTED APPROVED REJECTED ITEM_RECEIVED REFUND_INITIATED REFUND_COMPLETED }
enum ReturnReason { DAMAGED WRONG_ITEM NOT_AS_DESCRIBED CHANGED_MIND OTHER }

model ReturnRequest {                            // (new)
  id              String       @id @default(cuid())
  subOrderId      String
  userId          String
  reason          ReturnReason
  notes           String?
  status          ReturnStatus @default(REQUESTED)
  refund          Refund?
  @@index([subOrderId]) @@index([userId, createdAt]) @@index([status])
}
```

### 3.6 Payments

```prisma
enum PaymentStatus { PENDING AUTHORIZED CAPTURED FAILED REFUNDED PARTIALLY_REFUNDED }
enum PaymentMethod { COD UPI CARD NET_BANKING WALLET }

model Payment {                                  // (new) — 1:1 Order
  id             String        @id @default(cuid())
  orderId        String        @unique
  method         PaymentMethod
  status         PaymentStatus @default(PENDING)
  amount         Decimal       @db.Decimal(12,2)
  currency       String        @default("INR")
  gatewayRef     String?
  gatewayPayload Json?          // raw webhook payload (audit) — NEVER raw card data
  capturedAt     DateTime?
  failedAt       DateTime?
  transactions   Transaction[]
  refunds        Refund[]
  @@index([status]) @@index([gatewayRef])
}

model Transaction {                              // (new) — money ledger
  id         String   @id @default(cuid())
  paymentId  String
  type       String   // CHARGE | REFUND | CHARGEBACK
  amount     Decimal  @db.Decimal(12,2)
  gatewayRef String?
  metadata   Json?
  @@index([paymentId, createdAt])
}

model Refund {                                   // (new)
  id              String  @id @default(cuid())
  paymentId       String
  returnRequestId String? @unique
  amount          Decimal @db.Decimal(12,2)
  reason          String?
  gatewayRef      String?
  processedAt     DateTime?
  @@index([paymentId])
}

enum PayoutStatus { PENDING PROCESSING COMPLETED FAILED }

model SellerPayout {                             // (new) — one per SubOrder
  id          String       @id @default(cuid())
  sellerId    String
  subOrderId  String       @unique
  grossAmount Decimal      @db.Decimal(12,2)
  commission  Decimal      @db.Decimal(12,2)
  netAmount   Decimal      @db.Decimal(12,2)
  status      PayoutStatus @default(PENDING)
  processedAt DateTime?
  bankRef     String?
  @@index([sellerId, status]) @@index([status])
}
```

### 3.7 Platform (CMS, Support, Audit, Notifications)

```prisma
enum ContentStatus { DRAFT PUBLISHED ARCHIVED }
model ContentPage {                              // (new) CMS
  id String @id @default(cuid())
  slug String @unique
  title String
  body  String          // HTML/Markdown text
  status ContentStatus @default(DRAFT)
  publishedAt DateTime?
  deletedAt   DateTime?
  @@index([status, publishedAt]) @@index([deletedAt])
}

enum TicketStatus   { OPEN IN_PROGRESS RESOLVED CLOSED }
enum TicketCategory { ORDER_ISSUE PAYMENT RETURN_REFUND PRODUCT_QUERY ACCOUNT OTHER }
model SupportTicket {                            // (new)
  id String @id @default(cuid())
  userId String
  orderId String?
  category TicketCategory
  subject String
  status TicketStatus @default(OPEN)
  messages TicketMessage[]
  @@index([userId, createdAt]) @@index([status]) @@index([orderId])
}
model TicketMessage {                            // (new)
  id String @id @default(cuid())
  ticketId String
  senderId String
  body String
  isInternal Boolean @default(false)
  @@index([ticketId, createdAt])
}

model AuditLog { /* (existing) — finally WRITTEN by AuditService */ }

enum NotificationType {                          // (existing) + new values
  REGISTRATION_CONFIRMATION ORDER_CONFIRMATION SHIPPING_UPDATE DELIVERY_UPDATE
  NEW_ORDER LOW_STOCK REFUND_REQUEST
  // + SELLER_KYC_APPROVED SELLER_KYC_REJECTED PAYOUT_INITIATED PAYOUT_COMPLETED
  // + RETURN_REQUESTED RETURN_APPROVED NEW_REVIEW COUPON_APPLIED
}
model Notification { /* (existing) — generalize the listener pattern */ }
```

---

## 4. State Machines

### 4.1 SubOrder status (migrated from the existing order state machine)

```
PENDING ──► CONFIRMED ──► PROCESSING ──► SHIPPED ──► DELIVERED
   │            │              │                         │
   └─► CANCELLED ◄────────────┘                          └─► REFUNDED
       (release reserved)        (deduct on SHIPPED)        (restock on REFUNDED)
```

- **Transition guard:** the existing pure `assertTransition` (`orders/order-status.ts`) — reused verbatim, now keyed on `SubOrderStatus`.
- **Stock side-effects (atomic with the transition, existing pattern):** `CANCELLED → release`, `SHIPPED → deduct`, `REFUNDED → restock`. Movements reference `subOrderId`.
- **Authorization:** ADMIN any valid transition; SELLER only on **their** SubOrder; CUSTOMER only self-cancel **their** still-`PENDING` SubOrder. Mismatched owner → `NotFoundException`.

### 4.2 Order status (rollup — read-only, derived)

Recomputed in the **same transaction** as any SubOrder transition (`rollupOrderStatus`):
- all SubOrders `DELIVERED` → `DELIVERED`
- all `CANCELLED` → `CANCELLED`; all `REFUNDED` → `REFUNDED`
- any `SHIPPED`/`DELIVERED` and none earlier-active → `SHIPPED`
- otherwise the earliest active status (`PROCESSING`/`CONFIRMED`/`PENDING`).
Not a DB generated column (Postgres generated columns can't reference other tables) — service-layer.

### 4.3 Payment status

```
PENDING ──► AUTHORIZED ──► CAPTURED ──► (REFUNDED | PARTIALLY_REFUNDED)
   └────────► FAILED
COD: PENDING ──► CAPTURED (on delivery)   // no gateway round-trip
```
Idempotent capture keyed on gateway ref; refunds only against `CAPTURED`.

### 4.4 Seller status

```
PENDING_REVIEW ──► ACTIVE ──► SUSPENDED ──► ACTIVE
                      └──────► DEACTIVATED
```
Only `ACTIVE` sellers may list products / receive orders (enforced by `SellerApprovedGuard`, DB-backed).

### 4.5 Return status

```
REQUESTED ──► APPROVED ──► ITEM_RECEIVED ──► REFUND_INITIATED ──► REFUND_COMPLETED
     └──────► REJECTED
```
`ITEM_RECEIVED` triggers `restock`; `REFUND_INITIATED` creates a `Refund` against the `Payment` (guarded on `CAPTURED`).

---

## 5. The Totals Pipeline (per-seller)

The pure pipeline (`cart/totals.ts`, `cart/cart-pricing.ts`) stays the single authority but runs **once per seller group**:

```
for each seller group g in cart:
  g.subtotal      = Σ effectiveUnitPrice(item) × qty
  g.discountTotal = applySellerCoupon(g)              // scope=SELLER
  g.taxTotal      = tax(g.subtotal − g.discountTotal) // per-seller rate (config)
  g.shippingTotal = shippingQuote(g, address)         // ShippingProvider (mock→courier)
  g.grandTotal    = g.subtotal − g.discountTotal + g.taxTotal + g.shippingTotal

order.discountTotal += applyPlatformCoupon(order)     // scope=PLATFORM
order.grandTotal     = Σ g.grandTotal − platformCouponDelta
```

Each `g` becomes a `SubOrder` totals snapshot; the `Order` carries the aggregate. Cart preview and order review call the **same** function, so numbers never diverge (existing invariant, preserved).

---

## 6. Domain Event Catalog

Events follow the existing **deferred-emit-after-commit** pattern (proven by low-stock). In-process `@nestjs/event-emitter` now; the same contracts move onto Kafka/RabbitMQ on extraction (ADR-002). `[A]`=admin-facing, `[S]`=seller-facing, `[C]`=customer-facing notification consumers.

| Event | Producer (context) | Primary consumers | Notification |
|---|---|---|---|
| `auth.registered` | Identity | Notifications | `REGISTRATION_CONFIRMATION` [C] |
| `seller.registered` | Identity | Notifications | new-seller review queue [A] |
| `seller.kyc.approved` / `.rejected` | Identity | Notifications | `SELLER_KYC_*` [S] |
| `order.placed` | Commerce | Payments, Inventory(reserve), Notifications | `ORDER_CONFIRMATION` [C], `NEW_ORDER` [A][S] |
| `payment.captured` | Payments | Fulfillment(confirm SubOrders), Payout(calc), Notifications | — |
| `payment.failed` | Payments | Commerce(cancel), Notifications | [C] |
| `suborder.status.changed` | Fulfillment | Inventory(release/deduct/restock), Notifications, Analytics | `SHIPPING_UPDATE`/`DELIVERY_UPDATE` [C] |
| `shipment.event` | Fulfillment | Notifications | tracking update [C] |
| `inventory.low-stock` *(existing)* | Inventory | Notifications | `LOW_STOCK` [A][S] |
| `return.requested` / `.approved` | Fulfillment | Payments(refund), Inventory(restock), Notifications | `RETURN_*` [C][S] |
| `payout.initiated` / `.completed` | Payments | Notifications | `PAYOUT_*` [S] |
| `review.published` | Catalog | Catalog(rating aggregate), Notifications | `NEW_REVIEW` [S] |
| `coupon.applied` | Commerce | Analytics | `COUPON_APPLIED` [C] |

**Audit:** every sensitive mutation (order/suborder status, refund, stock adjustment, KYC approval, payout, coupon approval, role change) is written to `AuditLog` via `AuditService` — in-transaction with the mutation.

---

## 7. Key Invariants (must always hold)

1. **Money** is `Decimal(12,2)`, computed server-side only, snapshotted at order time. Never float, never client-computed.
2. **Inventory** changes only via signed append-only movements; `available + reserved` reconciles to the ledger; never oversell (`available ≥ reserve qty`).
3. **One `SubOrder` per (order, seller)**; `SubOrder` is the unit of fulfillment, status, and payout. `Order.status` is derived, never directly written.
4. **Seller isolation**: every seller-reachable query is `WHERE sellerId = actor.sub` (admin bypasses); mismatched owner → 404.
5. **No raw card data** anywhere (schema, logs, request bodies). Gateway tokenization/redirect only.
6. **One `Payment` per `Order`**; refunds only against `CAPTURED`; one `SellerPayout` per `SubOrder` (net = gross − commission).
7. **Events emit only after commit**; notifications/payouts/restock never fire on a rolled-back transaction.
8. **Verified reviews** require a `DELIVERED` SubOrder containing the product; one review per (product, customer).
9. **Totals parity**: cart preview total == order review total == sum of SubOrder grand totals (one shared pipeline).
10. **Audit completeness**: no sensitive mutation without a corresponding `AuditLog` row.
