# API Order Placement (Checkout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CUSTOMER-scoped checkout that turns the caller's cart into a snapshotted `Order` (status PENDING) and clears the cart, plus order history/detail reads — reusing the cart's totals pipeline so order totals never diverge from the cart.

**Architecture:** Extract the cart's price/line/totals math into a pure shared helper (`cart/cart-pricing.ts`) used by both `CartService` and a new `OrdersService`. Build out the existing `orders/` module (thin controller + service + DTOs) mirroring the `cart/` and `products/` conventions. Placement re-validates each line is ACTIVE, prices via the shared helper, then writes the order + clears the cart in one `prisma.$transaction`.

**Tech Stack:** NestJS, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL (`ecom_dev`), `@nestjs/config`, Jest, class-validator/class-transformer.

**Spec:** `docs/superpowers/specs/2026-06-17-api-order-placement-design.md`

## Global Constraints

- Strict TypeScript; no `any` in non-test code (test `as never`/`as any` for mock shaping is acceptable, matching `products.service.spec.ts`).
- Money: 2-dp string output, integer-cents math internally. Prices/totals come ONLY from the shared pricer; never trusted from the client.
- `OrderItem.unitPrice`/`lineTotal` and the order's five totals are SNAPSHOTS at placement; later price changes don't affect a placed order.
- Order created at status `PENDING` (use `OrderStatus.PENDING` from `@prisma/client`, which is exported as a value). The `order-status.ts` state machine is UNCHANGED in this slice.
- All `/orders` routes are `@Roles(Role.CUSTOMER)` (global guards enforce). User id from `@CurrentUser().sub`, never from a path/body. `import type { AccessTokenPayload }` in the controller (isolatedModules — mirror `auth.controller.ts`).
- `GET /orders/:id` for an order that isn't the caller's, or an unknown id → `404` (no existence leak).
- The refactor (Task 1) MUST be behavior-preserving: the existing `cart.service.spec.ts` stays green unchanged.
- No inventory, no payment, no notifications, no audit logging in this slice (deferred).
- NestJS compiled entry is `dist/src/main.js`; run via `npm --prefix apps/api run start:dev`. Shell cwd resets between tool calls — use `npm --prefix apps/api ...` or absolute paths.
- Branch `feat/api-order-placement` (already created, spec committed). Commit per task. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Commands: test `npm --prefix apps/api test`; single `npm --prefix apps/api test -- <pattern>`; lint `npm --prefix apps/api run lint`; build `npm --prefix apps/api run build`.

## File Structure

```
apps/api/src/
  cart/
    cart-pricing.ts          # NEW (Task 1) — pure: effectiveUnitCents + priceItems
    cart-pricing.spec.ts     # NEW (Task 1)
    cart.service.ts          # MODIFIED (Task 1) — buildEnvelope delegates to priceItems
  orders/
    dto/
      checkout.dto.ts        # NEW (Task 2)
      list-orders.dto.ts     # NEW (Task 2)
    orders.service.ts        # NEW (Tasks 3–4)
    orders.service.spec.ts   # NEW (Tasks 3–4)
    orders.controller.ts     # NEW (Task 5)
    orders.module.ts         # MODIFIED (Task 5) — wire controller + service
    order-status.ts          # UNCHANGED
```

Tasks 3 and 4 share `orders.service.ts`/`orders.service.spec.ts` (placement path vs. read path) — split because each ends with an independently testable deliverable.

---

### Task 1: Extract shared pricing helper (behavior-preserving refactor)

**Files:**
- Create: `apps/api/src/cart/cart-pricing.ts`
- Create: `apps/api/src/cart/cart-pricing.spec.ts`
- Modify: `apps/api/src/cart/cart.service.ts`

**Interfaces:**
- Consumes: `CartTotals`, `TotalsConfig`, `TotalsLine`, `centsToString`, `computeTotals` from `./totals`.
- Produces:
  - `interface PricingProduct { name: string; price: string; salePrice: string | null }`
  - `interface PricingItem { productId: string; quantity: number; product: PricingProduct; imageUrl?: string | null }`
  - `interface PricedLine { productId: string; name: string; unitPrice: string; quantity: number; lineTotal: string; imageUrl: string | null }`
  - `interface PricedResult { lines: PricedLine[]; totals: CartTotals }`
  - `function effectiveUnitCents(price: string, salePrice: string | null): number`
  - `function priceItems(items: PricingItem[], config: TotalsConfig): PricedResult`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/cart/cart-pricing.spec.ts
import { effectiveUnitCents, priceItems, PricingItem } from './cart-pricing';
import { TotalsConfig } from './totals';

const config: TotalsConfig = {
  taxRate: 0.1,
  shippingFlatCents: 500,
  freeShippingThresholdCents: 5000,
};

const item = (over: Partial<PricingItem> = {}): PricingItem => ({
  productId: 'p1',
  quantity: 1,
  product: { name: 'Mouse', price: '19.99', salePrice: null },
  imageUrl: null,
  ...over,
});

describe('effectiveUnitCents', () => {
  it('uses the regular price when there is no sale', () => {
    expect(effectiveUnitCents('19.99', null)).toBe(1999);
  });
  it('uses the sale price when strictly below regular', () => {
    expect(effectiveUnitCents('19.99', '9.99')).toBe(999);
  });
  it('uses the regular price when sale is not below regular', () => {
    expect(effectiveUnitCents('19.99', '25.00')).toBe(1999);
  });
  it('uses a $0.00 sale price (Decimal-0 not coerced to null)', () => {
    expect(effectiveUnitCents('19.99', '0.00')).toBe(0);
  });
});

describe('priceItems', () => {
  it('returns zero totals for no items', () => {
    const res = priceItems([], config);
    expect(res.lines).toEqual([]);
    expect(res.totals.grandTotal).toBe('0.00');
  });

  it('builds priced lines and totals (sale price applied, below threshold)', () => {
    const res = priceItems(
      [item({ quantity: 2, product: { name: 'Mouse', price: '19.99', salePrice: '9.99' }, imageUrl: 'http://img/m.jpg' })],
      config,
    );
    expect(res.lines).toEqual([
      {
        productId: 'p1',
        name: 'Mouse',
        unitPrice: '9.99',
        quantity: 2,
        lineTotal: '19.98',
        imageUrl: 'http://img/m.jpg',
      },
    ]);
    // subtotal 1998; tax 200; shipping 500; grand 2698
    expect(res.totals).toEqual({
      subtotal: '19.98',
      discountTotal: '0.00',
      taxTotal: '2.00',
      shippingTotal: '5.00',
      grandTotal: '26.98',
    });
  });

  it('sums multiple lines into the subtotal', () => {
    const res = priceItems(
      [
        item({ productId: 'a', quantity: 1, product: { name: 'A', price: '10.00', salePrice: null } }),
        item({ productId: 'b', quantity: 3, product: { name: 'B', price: '2.50', salePrice: null } }),
      ],
      config,
    );
    expect(res.totals.subtotal).toBe('17.50');
  });

  it('defaults imageUrl to null when omitted', () => {
    const res = priceItems([{ productId: 'p1', quantity: 1, product: { name: 'X', price: '5.00', salePrice: null } }], config);
    expect(res.lines[0].imageUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/api test -- cart-pricing.spec`
Expected: FAIL — cannot find module `./cart-pricing`.

- [ ] **Step 3: Write the helper**

```typescript
// apps/api/src/cart/cart-pricing.ts
/**
 * Shared cart/order pricing — the single authority for resolving effective
 * unit prices and building priced lines + totals. Pure (no Prisma, no Nest):
 * callers pass already-loaded rows. Both CartService (cart view) and
 * OrdersService (order snapshot) use this so their numbers can never diverge.
 */
import {
  CartTotals,
  TotalsConfig,
  TotalsLine,
  centsToString,
  computeTotals,
} from './totals';

/** Minimal product fields the pricer needs (a subset of the Prisma row). */
export interface PricingProduct {
  name: string;
  price: string; // Decimal as string
  salePrice: string | null;
}

/** A line to price: quantity + the product's pricing fields. */
export interface PricingItem {
  productId: string;
  quantity: number;
  product: PricingProduct;
  imageUrl?: string | null;
}

/** A priced line: effective unit price + line total as 2-dp strings. */
export interface PricedLine {
  productId: string;
  name: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  imageUrl: string | null;
}

export interface PricedResult {
  lines: PricedLine[];
  totals: CartTotals;
}

/** Effective unit price in integer cents: sale price when strictly below regular. */
export function effectiveUnitCents(
  price: string,
  salePrice: string | null,
): number {
  const regular = Math.round(Number(price) * 100);
  if (salePrice === null) return regular;
  const sale = Math.round(Number(salePrice) * 100);
  return sale < regular ? sale : regular;
}

/** Build priced lines and run the totals pipeline. */
export function priceItems(
  items: PricingItem[],
  config: TotalsConfig,
): PricedResult {
  const lines: PricedLine[] = [];
  const totalsLines: TotalsLine[] = [];

  for (const item of items) {
    const unitCents = effectiveUnitCents(item.product.price, item.product.salePrice);
    const lineCents = unitCents * item.quantity;
    totalsLines.push({ unitPriceCents: unitCents, quantity: item.quantity });
    lines.push({
      productId: item.productId,
      name: item.product.name,
      unitPrice: centsToString(unitCents),
      quantity: item.quantity,
      lineTotal: centsToString(lineCents),
      imageUrl: item.imageUrl ?? null,
    });
  }

  return { lines, totals: computeTotals(totalsLines, config) };
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npm --prefix apps/api test -- cart-pricing.spec`
Expected: PASS.

- [ ] **Step 5: Refactor `cart.service.ts` to delegate to `priceItems`**

In `apps/api/src/cart/cart.service.ts`:

1. Remove the module-local `effectiveUnitCents` function (lines ~48–54) — it now lives in `cart-pricing.ts`.
2. Update imports: drop `centsToString`, `computeTotals`, `TotalsLine` from the `./totals` import if no longer used directly (keep `CartTotals`, `TotalsConfig` — `CartTotals` is used by `CartView`, `TotalsConfig` by the field type). Add `import { priceItems } from './cart-pricing';`.
3. Replace the body of `buildEnvelope` with a thin adapter:

```typescript
  /** Map a loaded cart → priced envelope via the shared pricer. */
  protected buildEnvelope(cart: CartWithItems): CartView {
    const { lines, totals } = priceItems(
      cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        product: {
          name: item.product.name,
          price: item.product.price.toString(),
          salePrice:
            item.product.salePrice !== null
              ? item.product.salePrice.toString()
              : null,
        },
        imageUrl: item.product.images[0]?.url ?? null,
      })),
      this.totalsConfig,
    );

    return {
      id: cart.id,
      items: lines.map((line) => ({
        productId: line.productId,
        name: line.name,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        image: line.imageUrl,
      })),
      totals,
    };
  }
```

- [ ] **Step 6: Run the full cart + pricing suites to confirm the refactor is behavior-preserving**

Run: `npm --prefix apps/api test -- cart`
Expected: PASS — both `cart.service.spec` (unchanged) and `cart-pricing.spec` green. If `cart.service.spec` fails, the refactor changed behavior — fix the adapter, do not edit the cart tests.

- [ ] **Step 7: Lint + build**

Run: `npm --prefix apps/api run lint && npm --prefix apps/api run build`
Expected: clean (catches any now-unused import left behind in `cart.service.ts`).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/cart/cart-pricing.ts apps/api/src/cart/cart-pricing.spec.ts apps/api/src/cart/cart.service.ts
git commit -m "refactor(cart): extract shared priceItems helper (cart↔order parity)"
```

---

### Task 2: Order DTOs

**Files:**
- Create: `apps/api/src/orders/dto/checkout.dto.ts`
- Create: `apps/api/src/orders/dto/list-orders.dto.ts`

**Interfaces:**
- Produces:
  - `class CheckoutDto { shipFullName; shipLine1; shipLine2?; shipCity; shipState; shipCountry; shipPostalCode }` (all strings; `shipLine2` optional)
  - `class ListOrdersDto { page?: number; pageSize?: number }`

Declarative validation only; verified by compile + later smoke. Single commit, no red/green.

- [ ] **Step 1: Write `CheckoutDto`**

```typescript
// apps/api/src/orders/dto/checkout.dto.ts
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Shipping address captured at checkout; snapshotted onto the order. */
export class CheckoutDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  shipFullName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  shipLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  shipLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  shipCity!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  shipState!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  shipCountry!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  shipPostalCode!: string;
}
```

- [ ] **Step 2: Write `ListOrdersDto`**

```typescript
// apps/api/src/orders/dto/list-orders.dto.ts
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Pagination for the order-history list. Query params arrive as strings. */
export class ListOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm --prefix apps/api run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/orders/dto/
git commit -m "feat(orders): checkout + list-orders DTOs"
```

---

### Task 3: OrdersService — placement (`placeOrder`)

**Files:**
- Create: `apps/api/src/orders/orders.service.ts`
- Create: `apps/api/src/orders/orders.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`; `ConfigService`; `resolveTotalsConfig` from `../cart/cart.config`; `priceItems` from `../cart/cart-pricing`; `CheckoutDto`; `OrderStatus`, `ProductStatus`, `Prisma` from `@prisma/client`.
- Produces:
  - `interface OrderItemView { productId; productName: string; unitPrice: string; quantity: number; lineTotal: string }`
  - `interface OrderView { id; status; subtotal; discountTotal; taxTotal; shippingTotal; grandTotal; shipFullName; shipLine1; shipLine2: string | null; shipCity; shipState; shipCountry; shipPostalCode; items: OrderItemView[]; createdAt: Date }` (money fields as strings)
  - `class OrdersService` with `placeOrder(userId: string, dto: CheckoutDto): Promise<OrderView>`.
  - A private `toOrderView(order)` mapper and `ORDER_INCLUDE` (order → items) reused by Task 4.

The cart load for placement needs product `name, price, salePrice, status, deletedAt`. Convert Prisma Decimal totals/prices to strings in `toOrderView` via `.toString()`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/orders/orders.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { OrderStatus, ProductStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';

const makeConfig = () => ({
  get: (key: string) =>
    ({ TAX_RATE: '0.1', SHIPPING_FLAT: '5.00', FREE_SHIPPING_THRESHOLD: '50.00' })[key],
});

// $transaction(cb) executes the callback with a tx client that proxies to the
// same mock methods, so assertions can target prisma.order.create etc.
const makePrisma = () => {
  const prisma: any = {
    cart: { findFirst: jest.fn() },
    order: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    cartItem: { deleteMany: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (cb: (tx: any) => Promise<unknown>) => cb(prisma));
  return prisma;
};

const build = () => {
  const prisma = makePrisma();
  const svc = new OrdersService(prisma as never, makeConfig() as never);
  return { svc, prisma };
};

const shipping: CheckoutDto = {
  shipFullName: 'Ada Lovelace',
  shipLine1: '12 Analytical Way',
  shipCity: 'London',
  shipState: 'Greater London',
  shipCountry: 'UK',
  shipPostalCode: 'EC1A 1BB',
};

const cartWith = (items: unknown[]) => ({ id: 'cart1', items });
const activeLine = (over: Record<string, unknown> = {}) => ({
  productId: 'p1',
  quantity: 2,
  product: {
    name: 'Mouse',
    price: '19.99',
    salePrice: null,
    status: ProductStatus.ACTIVE,
    deletedAt: null,
  },
  ...over,
});

/** What order.create resolves to (Decimal-as-string via the mapper's .toString()). */
const createdOrder = {
  id: 'order1',
  status: OrderStatus.PENDING,
  subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00',
  shippingTotal: '5.00', grandTotal: '48.98',
  ...shipping, shipLine2: null,
  items: [
    { productId: 'p1', productName: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98' },
  ],
  createdAt: new Date('2026-06-17T12:00:00Z'),
};

describe('OrdersService.placeOrder', () => {
  it('creates a PENDING order with snapshotted totals + items and clears the cart', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(cartWith([activeLine()]));
    prisma.order.create.mockResolvedValue(createdOrder);

    const view = await svc.placeOrder('u1', shipping);

    // order.create called with PENDING status + computed totals + nested items
    const createArg = prisma.order.create.mock.calls[0][0];
    expect(createArg.data.status).toBe(OrderStatus.PENDING);
    expect(createArg.data.userId).toBe('u1');
    expect(createArg.data.subtotal).toBe('39.98');
    expect(createArg.data.grandTotal).toBe('48.98');
    expect(createArg.data.shipFullName).toBe('Ada Lovelace');
    expect(createArg.data.items.create).toEqual([
      { productId: 'p1', productName: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98' },
    ]);
    // cart cleared
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart1' } });
    // wrapped in a transaction
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(view.id).toBe('order1');
    expect(view.status).toBe(OrderStatus.PENDING);
  });

  it('rejects an empty cart with 400 and creates no order', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(cartWith([]));
    await expect(svc.placeOrder('u1', shipping)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects when the user has no cart at all with 400', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(null);
    await expect(svc.placeOrder('u1', shipping)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('rejects a non-ACTIVE line with 400 and creates no order', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(
      cartWith([activeLine({ product: { name: 'Gone', price: '5.00', salePrice: null, status: ProductStatus.ARCHIVED, deletedAt: null } })]),
    );
    await expect(svc.placeOrder('u1', shipping)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/api test -- orders.service.spec`
Expected: FAIL — cannot find module `./orders.service`.

- [ ] **Step 3: Write the service (placement only)**

```typescript
// apps/api/src/orders/orders.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTotalsConfig } from '../cart/cart.config';
import { priceItems, PricingItem } from '../cart/cart-pricing';
import { TotalsConfig } from '../cart/totals';
import { CheckoutDto } from './dto/checkout.dto';

export interface OrderItemView {
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
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
  items: OrderItemView[];
  createdAt: Date;
}

/** Cart load for placement: items + the product fields the pricer + validation need. */
const CART_FOR_CHECKOUT = {
  items: {
    include: {
      product: {
        select: {
          name: true,
          price: true,
          salePrice: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

/** Order load shape for views. */
const ORDER_INCLUDE = { items: true } satisfies Prisma.OrderInclude;
type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

@Injectable()
export class OrdersService {
  private readonly totalsConfig: TotalsConfig;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.totalsConfig = resolveTotalsConfig(config);
  }

  async placeOrder(userId: string, dto: CheckoutDto): Promise<OrderView> {
    const cart = await this.prisma.cart.findFirst({
      where: { userId },
      include: CART_FOR_CHECKOUT,
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    // Re-validate each line and build pricer input from current product data.
    const pricingItems: PricingItem[] = cart.items.map((item) => {
      const p = item.product;
      if (p.deletedAt !== null || p.status !== ProductStatus.ACTIVE) {
        throw new BadRequestException(
          `'${p.name}' is no longer available; remove it to checkout`,
        );
      }
      return {
        productId: item.productId,
        quantity: item.quantity,
        product: {
          name: p.name,
          price: p.price.toString(),
          salePrice: p.salePrice !== null ? p.salePrice.toString() : null,
        },
      };
    });

    const { lines, totals } = priceItems(pricingItems, this.totalsConfig);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          shippingTotal: totals.shippingTotal,
          grandTotal: totals.grandTotal,
          shipFullName: dto.shipFullName,
          shipLine1: dto.shipLine1,
          shipLine2: dto.shipLine2 ?? null,
          shipCity: dto.shipCity,
          shipState: dto.shipState,
          shipCountry: dto.shipCountry,
          shipPostalCode: dto.shipPostalCode,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              productName: line.name,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: ORDER_INCLUDE,
      });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return created;
    });

    return this.toOrderView(order);
  }

  /** Map a loaded order (Prisma Decimals) → the string-money view. */
  protected toOrderView(order: OrderWithItems): OrderView {
    return {
      id: order.id,
      status: order.status,
      subtotal: order.subtotal.toString(),
      discountTotal: order.discountTotal.toString(),
      taxTotal: order.taxTotal.toString(),
      shippingTotal: order.shippingTotal.toString(),
      grandTotal: order.grandTotal.toString(),
      shipFullName: order.shipFullName,
      shipLine1: order.shipLine1,
      shipLine2: order.shipLine2,
      shipCity: order.shipCity,
      shipState: order.shipState,
      shipCountry: order.shipCountry,
      shipPostalCode: order.shipPostalCode,
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        unitPrice: item.unitPrice.toString(),
        quantity: item.quantity,
        lineTotal: item.lineTotal.toString(),
      })),
      createdAt: order.createdAt,
    };
  }
}
```

> Note: the test mocks return string money fields directly, so `.toString()` on a JS string is a no-op (returns the same string) — `toOrderView` works against both the mock and real Prisma Decimals.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix apps/api test -- orders.service.spec`
Expected: PASS (4 cases).

- [ ] **Step 5: Lint + build**

Run: `npm --prefix apps/api run lint && npm --prefix apps/api run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.service.spec.ts
git commit -m "feat(orders): placeOrder — cart→order snapshot + clear (PENDING, txn)"
```

---

### Task 4: OrdersService — reads (`getOrder`, `listOrders`)

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts`
- Modify: `apps/api/src/orders/orders.service.spec.ts`

**Interfaces:**
- Consumes: everything from Task 3 (`toOrderView`, `ORDER_INCLUDE`); `ListOrdersDto`; `NotFoundException` from `@nestjs/common`.
- Produces, on `OrdersService`:
  - `interface OrderSummary { id: string; status: OrderStatus; grandTotal: string; itemCount: number; createdAt: Date }`
  - `interface Paginated<T> { data: T[]; page: number; pageSize: number; total: number; totalPages: number }`
  - `getOrder(userId: string, orderId: string): Promise<OrderView>` — scoped by userId; `404` if not found/owned.
  - `listOrders(userId: string, query: ListOrdersDto): Promise<Paginated<OrderSummary>>` — newest-first, with `itemCount` via `_count`.

- [ ] **Step 1: Add the failing tests**

Append to `apps/api/src/orders/orders.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';

describe('OrdersService.getOrder', () => {
  it('returns the caller’s own order', async () => {
    const { svc, prisma } = build();
    prisma.order.findFirst.mockResolvedValue(createdOrder);

    const view = await svc.getOrder('u1', 'order1');

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order1', userId: 'u1' },
      include: { items: true },
    });
    expect(view.id).toBe('order1');
  });

  it('throws 404 for an unknown or non-owned order', async () => {
    const { svc, prisma } = build();
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(svc.getOrder('u1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OrdersService.listOrders', () => {
  it('returns a paginated, newest-first summary scoped to the user', async () => {
    const { svc, prisma } = build();
    prisma.order.findMany.mockResolvedValue([
      { id: 'o2', status: OrderStatus.PENDING, grandTotal: '48.98', createdAt: new Date('2026-06-17T12:00:00Z'), _count: { items: 2 } },
    ]);
    prisma.order.count.mockResolvedValue(1);

    const res = await svc.listOrders('u1', {});

    const findArg = prisma.order.findMany.mock.calls[0][0];
    expect(findArg.where).toEqual({ userId: 'u1' });
    expect(findArg.orderBy).toEqual({ createdAt: 'desc' });
    expect(prisma.order.count).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(res).toEqual({
      data: [
        { id: 'o2', status: OrderStatus.PENDING, grandTotal: '48.98', itemCount: 2, createdAt: new Date('2026-06-17T12:00:00Z') },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/api test -- orders.service.spec`
Expected: FAIL — `svc.getOrder` / `svc.listOrders` are not functions.

- [ ] **Step 3: Add the read methods + types**

Add the imports and types, then the methods. At the top of `orders.service.ts` add `NotFoundException` to the `@nestjs/common` import and `ListOrdersDto`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
// ...existing imports...
import { ListOrdersDto } from './dto/list-orders.dto';
```

Add these interfaces near `OrderView`:

```typescript
export interface OrderSummary {
  id: string;
  status: OrderStatus;
  grandTotal: string;
  itemCount: number;
  createdAt: Date;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
```

Add these methods to `OrdersService`:

```typescript
  async getOrder(userId: string, orderId: string): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.toOrderView(order);
  }

  async listOrders(
    userId: string,
    query: ListOrdersDto,
  ): Promise<Paginated<OrderSummary>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = { userId };

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          status: true,
          grandTotal: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        status: row.status,
        grandTotal: row.grandTotal.toString(),
        itemCount: row._count.items,
        createdAt: row.createdAt,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix apps/api test -- orders.service.spec`
Expected: PASS (all placement + read cases).

- [ ] **Step 5: Lint + build**

Run: `npm --prefix apps/api run lint && npm --prefix apps/api run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.service.spec.ts
git commit -m "feat(orders): getOrder (ownership-scoped) + paginated listOrders"
```

---

### Task 5: Controller + module wiring

**Files:**
- Create: `apps/api/src/orders/orders.controller.ts`
- Modify: `apps/api/src/orders/orders.module.ts`

**Interfaces:**
- Consumes: `OrdersService` (Tasks 3–4); `CheckoutDto`/`ListOrdersDto` (Task 2); `@Roles(Role.CUSTOMER)`; `@CurrentUser()` → `AccessTokenPayload`; `PrismaModule`.
- Produces: HTTP routes + `OrdersModule` wiring. `ConfigService` resolves via the global `ConfigModule` (registered in `AppModule`), so `OrdersModule` does not import `ConfigModule`.

No new unit test — thin controller, covered by the Task 6 smoke run (matches `cart.controller.ts`/`products.controller.ts`).

- [ ] **Step 1: Write the controller**

```typescript
// apps/api/src/orders/orders.controller.ts
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

/**
 * Customer-scoped orders. Placement turns the caller's cart into an order
 * (status PENDING; no payment, no stock reservation yet — Phase 5). Reads are
 * scoped to the caller's own orders; another user's id returns 404. Role
 * boundary enforced by the global RolesGuard.
 */
@Roles(Role.CUSTOMER)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  place(@CurrentUser() user: AccessTokenPayload, @Body() dto: CheckoutDto) {
    return this.orders.placeOrder(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListOrdersDto) {
    return this.orders.listOrders(user.sub, query);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.orders.getOrder(user.sub, id);
  }
}
```

- [ ] **Step 2: Wire the module**

Replace the contents of `apps/api/src/orders/orders.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * Orders domain module. Owns the order lifecycle and its state-machine guard
 * (`order-status.ts`). This slice adds customer order placement + reads;
 * admin status transitions and inventory land in Phase 5.
 */
@Module({
  imports: [PrismaModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
```

- [ ] **Step 3: Build, lint, full suite**

Run: `npm --prefix apps/api run build && npm --prefix apps/api run lint && npm --prefix apps/api test`
Expected: build clean; lint clean; ALL tests green (existing + cart-pricing + orders).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/orders/orders.controller.ts apps/api/src/orders/orders.module.ts
git commit -m "feat(orders): customer-scoped /orders controller + module wiring"
```

---

### Task 6: HTTP smoke run + PLAN.md update

**Files:**
- Modify: `PLAN.md` (Phase 4 checkbox + status table + status note)

**Interfaces:** none (verification + docs). RULE.md §5 gate.

- [ ] **Step 1: Start the API**

Run (background): `npm --prefix apps/api run start:dev`
Wait for `Nest application successfully started` on `:5000` (poll `GET /products` → 200).

- [ ] **Step 2: Register a customer + build a cart**

```bash
API=http://localhost:5000; J="Content-Type: application/json"
EMAIL="order-smoke-$(date +%s)@example.com"
curl -s -X POST "$API/auth/register" -H "$J" -d "{\"email\":\"$EMAIL\",\"name\":\"Order Smoke\",\"password\":\"Password123!\"}" >/dev/null
TOKEN=$(curl -s -X POST "$API/auth/login" -H "$J" -d "{\"email\":\"$EMAIL\",\"password\":\"Password123!\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
AUTH="Authorization: Bearer $TOKEN"
PID=$(curl -s "$API/products?status=ACTIVE&pageSize=1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"][0]["id"])')
curl -s -X POST -H "$AUTH" -H "$J" "$API/cart/items" -d "{\"productId\":\"$PID\",\"quantity\":2}" >/dev/null
CART_GRAND=$(curl -s -H "$AUTH" "$API/cart" | python3 -c 'import sys,json;print(json.load(sys.stdin)["totals"]["grandTotal"])')
echo "cart grandTotal: $CART_GRAND"
```

- [ ] **Step 3: Place the order and verify parity + cart cleared**

```bash
SHIP='{"shipFullName":"Ada Lovelace","shipLine1":"12 Analytical Way","shipCity":"London","shipState":"Greater London","shipCountry":"UK","shipPostalCode":"EC1A 1BB"}'
ORDER=$(curl -s -X POST -H "$AUTH" -H "$J" "$API/orders" -d "$SHIP")
echo "$ORDER" | python3 -c 'import sys,json;o=json.load(sys.stdin);print("order status:",o["status"],"grand:",o["grandTotal"],"items:",len(o["items"]))'
ORDER_ID=$(echo "$ORDER" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
# parity: order grand == cart grand captured before checkout
echo "parity (order vs cart): $(echo "$ORDER" | python3 -c 'import sys,json;print(json.load(sys.stdin)["grandTotal"])') == $CART_GRAND"
# cart now empty
curl -s -H "$AUTH" "$API/cart" | python3 -c 'import sys,json;print("cart items after checkout:",len(json.load(sys.stdin)["items"]))'
# appears in history + detail
curl -s -H "$AUTH" "$API/orders" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("history total:",d["total"],"first itemCount:",d["data"][0]["itemCount"])'
curl -s -o /dev/null -w "GET /orders/:id -> %{http_code}\n" -H "$AUTH" "$API/orders/$ORDER_ID"
```

Expected: order `status` = PENDING; order `grandTotal` == `$CART_GRAND`; cart items after checkout = 0; history total ≥ 1 with correct itemCount; detail → 200.

- [ ] **Step 4: Boundaries**

```bash
# empty-cart placement (cart already cleared) -> 400
curl -s -o /dev/null -w "empty-cart POST /orders -> %{http_code}\n" -X POST -H "$AUTH" -H "$J" "$API/orders" -d "$SHIP"
# unauth -> 401
curl -s -o /dev/null -w "no-token GET /orders -> %{http_code}\n" "$API/orders"
# admin role -> 403
ADMIN=$(curl -s -X POST "$API/auth/login" -H "$J" -d '{"email":"admin@example.com","password":"Password123!"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
curl -s -o /dev/null -w "admin GET /orders -> %{http_code}\n" -H "Authorization: Bearer $ADMIN" "$API/orders"
# second customer cannot read first's order -> 404
EMAIL2="order-smoke2-$(date +%s)@example.com"
curl -s -X POST "$API/auth/register" -H "$J" -d "{\"email\":\"$EMAIL2\",\"name\":\"Other\",\"password\":\"Password123!\"}" >/dev/null
TOKEN2=$(curl -s -X POST "$API/auth/login" -H "$J" -d "{\"email\":\"$EMAIL2\",\"password\":\"Password123!\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
curl -s -o /dev/null -w "other-customer GET first order -> %{http_code}\n" -H "Authorization: Bearer $TOKEN2" "$API/orders/$ORDER_ID"
# archived-product placement -> 400: rebuild a cart, archive the product via admin, then place
curl -s -X POST -H "$AUTH" -H "$J" "$API/cart/items" -d "{\"productId\":\"$PID\",\"quantity\":1}" >/dev/null
curl -s -o /dev/null -X POST -H "Authorization: Bearer $ADMIN" "$API/products/$PID/archive"
curl -s -o /dev/null -w "archived-line POST /orders -> %{http_code}\n" -X POST -H "$AUTH" -H "$J" "$API/orders" -d "$SHIP"
# restore product so seed state is unchanged
curl -s -o /dev/null -X PATCH -H "Authorization: Bearer $ADMIN" -H "$J" "$API/products/$PID/active" -d '{"active":true}'
```

Expected: empty-cart → 400; no-token → 401; admin → 403; other customer → 404; archived-line → 400; restore → 200.

- [ ] **Step 5: Stop the API and record the smoke result**

Stop the background dev server (kill the process on `:5000`).

- [ ] **Step 6: Update PLAN.md**

- Tick the Phase 4 storefront/`API ... place order` line? No — tick the Phase 4 task checkbox for order placement. The Phase 4 task list has the cart API line already `[x]`; the next line covers the storefront. Order placement is part of the API work: update the Phase 4 status row note to add "order placement ✅" and append a status note (mirroring the cart slice note): endpoints shipped (`POST/GET /orders`, `GET /orders/:id`), PENDING status, cart cleared, totals parity, no inventory/payment, test counts, smoke result vs `ecom_dev`, branch `feat/api-order-placement`. Keep the phase status `🟡 In Progress` (storefront cart UI + checkout UI remain).

- [ ] **Step 7: Commit**

```bash
git add PLAN.md
git commit -m "docs(phase4): mark order-placement API slice done; update PLAN status"
```

---

## Self-Review

**1. Spec coverage:**
- `POST /orders` placement (cart→order, PENDING, totals snapshot, cart clear, txn) → Task 3 + Task 5 controller. ✅
- `GET /orders` paginated lightweight summaries (itemCount, newest-first) → Task 4 + Task 5. ✅
- `GET /orders/:id` full detail, ownership-scoped 404 → Task 4 + Task 5. ✅
- Shared totals/line helper so cart↔order never diverge → Task 1 (`priceItems`), with divergence-guard covered by cart-pricing tests + cart.service tests staying green. ✅
- Empty cart → 400; non-ACTIVE line → 400 → Task 3 tests. ✅
- CheckoutDto / ListOrdersDto validation → Task 2. ✅
- CUSTOMER-only authz, user from `.sub`, 401/403 → Task 5 + smoke (Task 6). ✅
- Money as snapshot strings, integer-cents math, no client trust → Tasks 1/3 (`priceItems`, `toOrderView`). ✅
- Smoke vs `ecom_dev` incl. parity, cart-cleared, ownership 404, archived-line 400 → Task 6. ✅
- Out-of-scope (inventory, payment, status transitions, notifications, audit, saved-address) → not built. ✅

**2. Placeholder scan:** No "TBD/handle errors/etc." — every code step has full code; every test asserts concrete values; every command has expected output.

**3. Type consistency:** `priceItems`/`PricingItem`/`PricedLine`/`PricedResult`/`effectiveUnitCents` (Task 1) consumed unchanged in Task 3. `OrderView`/`OrderItemView`/`toOrderView`/`ORDER_INCLUDE` (Task 3) reused by Task 4’s `getOrder`. `OrderSummary`/`Paginated<T>` (Task 4) returned by `listOrders` and consumed by the controller (Task 5). `placeOrder(userId, dto)`, `getOrder(userId, orderId)`, `listOrders(userId, query)` signatures match between service definitions (Tasks 3–4) and controller calls (Task 5). `OrderStatus.PENDING` from `@prisma/client` used consistently. ✅
