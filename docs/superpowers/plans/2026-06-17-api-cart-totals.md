# API Cart + Totals Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CUSTOMER-scoped, server-authoritative shopping cart with a single shared totals pipeline (`subtotal → discounts → taxes → shipping → grand total`).

**Architecture:** New `cart/` NestJS module mirroring the existing `products/` conventions (thin controller, logic in service, class-validator DTOs, `mapWriteError` for Prisma). A pure `totals.ts` function (integer-cents math, no Prisma/Nest types) is the single authority both this cart and the later order-review slice call. One active `Cart` per user; line prices are resolved live from the product on every read.

**Tech Stack:** NestJS, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL (`ecom_dev`), `@nestjs/config`, Jest, class-validator/class-transformer.

**Spec:** `docs/superpowers/specs/2026-06-17-api-cart-totals-design.md`

## Global Constraints

- Strict TypeScript; no `any`. DTOs validated at the boundary with class-validator.
- Money stored/serialized as 2-dp Decimal strings (e.g. `"19.99"`); pipeline math in integer cents.
- Authorization is API-enforced via global guards: cart routes are `@Roles(Role.CUSTOMER)`. Never trusted from the client.
- Reads/writes go through `PrismaService` (already wired with the v7 driver adapter). Never mutate raw quantities elsewhere; this slice does **not** touch inventory.
- Effective unit price = sale price when `salePrice` is non-null and strictly `< price`, else regular price (matches storefront `money.ts:isOnSale`).
- NestJS compiled entry is `dist/src/main.js`; run via `npm --prefix apps/api run start:dev`. Shell cwd resets between tool calls — use `npm --prefix apps/api ...`.
- One feature/task at a time; commit per task. Branch: `feat/api-cart` (already created, spec committed).
- Test command: `npm --prefix apps/api test`. Single file: `npm --prefix apps/api test -- <pattern>`. Lint: `npm --prefix apps/api run lint`. Build: `npm --prefix apps/api run build`.

## File Structure

```
apps/api/src/cart/
  totals.ts                    # PURE pipeline + types (Task 1)
  totals.spec.ts               # (Task 1)
  cart.config.ts               # env → integer-cents TotalsConfig (Task 2)
  cart.config.spec.ts          # (Task 2)
  dto/
    add-cart-item.dto.ts       # productId, quantity >= 1 (Task 3)
    update-cart-item.dto.ts    # quantity >= 0 (Task 3)
  cart.service.ts              # persistence + buildEnvelope (Tasks 4–5)
  cart.service.spec.ts         # (Tasks 4–5)
  cart.controller.ts           # @Roles(CUSTOMER) routes (Task 6)
  cart.module.ts               # wire controller + service (Task 6, replaces stub)
apps/api/.env.example          # add TAX_RATE / SHIPPING_FLAT / FREE_SHIPPING_THRESHOLD (Task 2)
```

Tasks 4 and 5 share `cart.service.ts`/`cart.service.spec.ts` but are split because each ends with an independently testable deliverable (read path vs. mutation path).

---

### Task 1: Pure totals pipeline (`totals.ts`)

**Files:**
- Create: `apps/api/src/cart/totals.ts`
- Test: `apps/api/src/cart/totals.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface TotalsLine { unitPriceCents: number; quantity: number }`
  - `interface TotalsConfig { taxRate: number; shippingFlatCents: number; freeShippingThresholdCents: number }`
  - `interface CartTotals { subtotal: string; discountTotal: string; taxTotal: string; shippingTotal: string; grandTotal: string }`
  - `function computeTotals(lines: TotalsLine[], config: TotalsConfig): CartTotals`
  - `function centsToString(cents: number): string` (helper; exported for reuse by the service in Task 5)

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/cart/totals.spec.ts
import { computeTotals, centsToString, TotalsConfig } from './totals';

const config: TotalsConfig = {
  taxRate: 0.1,
  shippingFlatCents: 500,
  freeShippingThresholdCents: 5000,
};

describe('centsToString', () => {
  it('formats integer cents as a 2-dp string', () => {
    expect(centsToString(0)).toBe('0.00');
    expect(centsToString(4)).toBe('0.04');
    expect(centsToString(1999)).toBe('19.99');
    expect(centsToString(4898)).toBe('48.98');
  });
});

describe('computeTotals', () => {
  it('returns all-zero totals (and zero shipping) for an empty cart', () => {
    expect(computeTotals([], config)).toEqual({
      subtotal: '0.00',
      discountTotal: '0.00',
      taxTotal: '0.00',
      shippingTotal: '0.00',
      grandTotal: '0.00',
    });
  });

  it('sums a single line below the free-shipping threshold and applies flat shipping', () => {
    // 1999 * 2 = 3998 subtotal; tax 399.8 -> 400; shipping 500; grand 4898
    const res = computeTotals([{ unitPriceCents: 1999, quantity: 2 }], config);
    expect(res).toEqual({
      subtotal: '39.98',
      discountTotal: '0.00',
      taxTotal: '4.00',
      shippingTotal: '5.00',
      grandTotal: '48.98',
    });
  });

  it('sums multiple lines', () => {
    const res = computeTotals(
      [
        { unitPriceCents: 1000, quantity: 1 },
        { unitPriceCents: 250, quantity: 3 },
      ],
      config,
    );
    expect(res.subtotal).toBe('17.50'); // 1000 + 750
  });

  it('rounds tax half-up to the nearest cent', () => {
    // subtotal 1005; tax 100.5 -> 101
    const res = computeTotals([{ unitPriceCents: 1005, quantity: 1 }], config);
    expect(res.taxTotal).toBe('1.01');
  });

  it('charges flat shipping just below the threshold', () => {
    const res = computeTotals([{ unitPriceCents: 4999, quantity: 1 }], config);
    expect(res.shippingTotal).toBe('5.00');
  });

  it('gives free shipping exactly at the threshold', () => {
    const res = computeTotals([{ unitPriceCents: 5000, quantity: 1 }], config);
    expect(res.shippingTotal).toBe('0.00');
  });

  it('gives free shipping above the threshold', () => {
    const res = computeTotals([{ unitPriceCents: 6000, quantity: 1 }], config);
    expect(res.shippingTotal).toBe('0.00');
  });

  it('computes grandTotal = subtotal - discount + tax + shipping', () => {
    const res = computeTotals([{ unitPriceCents: 1999, quantity: 2 }], config);
    // 3998 - 0 + 400 + 500 = 4898
    expect(res.grandTotal).toBe('48.98');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/api test -- totals.spec`
Expected: FAIL — cannot find module `./totals`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// apps/api/src/cart/totals.ts
/**
 * Pure cart/order totals pipeline — the single authority for
 * subtotal → discounts → taxes → shipping → grand total.
 *
 * No Prisma, no Nest. All math is in integer cents to avoid float drift;
 * money leaves as 2-dp strings to match the API's Decimal-as-string contract.
 * The order-review slice (Phase 4, slice 2) MUST reuse this, not reimplement it.
 */

/** One priced cart line. Caller resolves the effective unit price (sale vs regular). */
export interface TotalsLine {
  unitPriceCents: number;
  quantity: number;
}

/** Pricing rules, pre-parsed to integer cents (see cart.config.ts). */
export interface TotalsConfig {
  taxRate: number;
  shippingFlatCents: number;
  freeShippingThresholdCents: number;
}

/** The five-stage pipeline result, as 2-dp money strings. */
export interface CartTotals {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
}

/** Format integer cents as a 2-dp money string, e.g. 4898 -> "48.98". */
export function centsToString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = (abs % 100).toString().padStart(2, '0');
  return `${sign}${dollars}.${remainder}`;
}

/** Round half-up to the nearest integer cent. */
function roundCents(value: number): number {
  return Math.round(value);
}

export function computeTotals(
  lines: TotalsLine[],
  config: TotalsConfig,
): CartTotals {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0,
  );
  const discountTotal = 0; // Out of PRD scope; present for pipeline completeness.
  const taxTotal = roundCents(subtotal * config.taxRate);
  const shippingTotal =
    subtotal === 0 || subtotal >= config.freeShippingThresholdCents
      ? 0
      : config.shippingFlatCents;
  const grandTotal = subtotal - discountTotal + taxTotal + shippingTotal;

  return {
    subtotal: centsToString(subtotal),
    discountTotal: centsToString(discountTotal),
    taxTotal: centsToString(taxTotal),
    shippingTotal: centsToString(shippingTotal),
    grandTotal: centsToString(grandTotal),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix apps/api test -- totals.spec`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cart/totals.ts apps/api/src/cart/totals.spec.ts
git commit -m "feat(cart): pure totals pipeline (subtotal→tax→shipping→grand)"
```

---

### Task 2: Env-backed config (`cart.config.ts`)

**Files:**
- Create: `apps/api/src/cart/cart.config.ts`
- Test: `apps/api/src/cart/cart.config.spec.ts`
- Modify: `apps/api/.env.example` (append the three vars)

**Interfaces:**
- Consumes: `TotalsConfig` from `./totals` (Task 1); `ConfigService` from `@nestjs/config`.
- Produces: `function resolveTotalsConfig(config: ConfigService): TotalsConfig` — reads `TAX_RATE` (fractional, default `0.10`), `SHIPPING_FLAT` (currency units, default `5.00`), `FREE_SHIPPING_THRESHOLD` (currency units, default `50.00`); converts the two money values to integer cents.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/cart/cart.config.spec.ts
import { resolveTotalsConfig } from './cart.config';

/** Minimal ConfigService stand-in: get(key) -> value from a map. */
const makeConfig = (values: Record<string, string>) => ({
  get: (key: string) => values[key],
});

describe('resolveTotalsConfig', () => {
  it('uses defaults when env vars are absent', () => {
    const cfg = resolveTotalsConfig(makeConfig({}) as never);
    expect(cfg).toEqual({
      taxRate: 0.1,
      shippingFlatCents: 500,
      freeShippingThresholdCents: 5000,
    });
  });

  it('parses provided values and converts money to integer cents', () => {
    const cfg = resolveTotalsConfig(
      makeConfig({
        TAX_RATE: '0.2',
        SHIPPING_FLAT: '7.50',
        FREE_SHIPPING_THRESHOLD: '100',
      }) as never,
    );
    expect(cfg).toEqual({
      taxRate: 0.2,
      shippingFlatCents: 750,
      freeShippingThresholdCents: 10000,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/api test -- cart.config.spec`
Expected: FAIL — cannot find module `./cart.config`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// apps/api/src/cart/cart.config.ts
import { ConfigService } from '@nestjs/config';
import { TotalsConfig } from './totals';

const DEFAULT_TAX_RATE = 0.1;
const DEFAULT_SHIPPING_FLAT = 5.0;
const DEFAULT_FREE_SHIPPING_THRESHOLD = 50.0;

/** Parse a currency-unit string (e.g. "5.00") to integer cents, half-up. */
function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Resolve the cart pricing rules from env (with safe defaults) into the
 * integer-cents `TotalsConfig` the pure pipeline expects.
 */
export function resolveTotalsConfig(config: ConfigService): TotalsConfig {
  const taxRate = Number(config.get('TAX_RATE') ?? DEFAULT_TAX_RATE);
  const shippingFlat = Number(
    config.get('SHIPPING_FLAT') ?? DEFAULT_SHIPPING_FLAT,
  );
  const freeShippingThreshold = Number(
    config.get('FREE_SHIPPING_THRESHOLD') ?? DEFAULT_FREE_SHIPPING_THRESHOLD,
  );

  return {
    taxRate,
    shippingFlatCents: toCents(shippingFlat),
    freeShippingThresholdCents: toCents(freeShippingThreshold),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix apps/api test -- cart.config.spec`
Expected: PASS.

- [ ] **Step 5: Append the env template**

Add to the end of `apps/api/.env.example`:

```
# Cart totals pipeline (Phase 4). Tax is a fraction; the two money values are
# currency units, converted to integer cents internally.
TAX_RATE="0.10"
SHIPPING_FLAT="5.00"
FREE_SHIPPING_THRESHOLD="50.00"
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cart/cart.config.ts apps/api/src/cart/cart.config.spec.ts apps/api/.env.example
git commit -m "feat(cart): env-backed totals config (tax/shipping rates)"
```

---

### Task 3: Request DTOs

**Files:**
- Create: `apps/api/src/cart/dto/add-cart-item.dto.ts`
- Create: `apps/api/src/cart/dto/update-cart-item.dto.ts`

**Interfaces:**
- Consumes: class-validator decorators, `Type` from class-transformer.
- Produces:
  - `class AddCartItemDto { productId: string; quantity: number }`
  - `class UpdateCartItemDto { quantity: number }`

DTOs are validated at the HTTP boundary by the global pipe; no separate unit test (they are exercised by the smoke run in Task 7). This task is folded into a single commit with no red/green cycle because there is no logic to test — just declarative validation.

- [ ] **Step 1: Write `AddCartItemDto`**

```typescript
// apps/api/src/cart/dto/add-cart-item.dto.ts
import { IsInt, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

/** Add a product to the cart (or increment if already present). */
export class AddCartItemDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}
```

- [ ] **Step 2: Write `UpdateCartItemDto`**

```typescript
// apps/api/src/cart/dto/update-cart-item.dto.ts
import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Set the absolute quantity of a cart line. Quantity 0 removes the line. */
export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm --prefix apps/api run build`
Expected: build succeeds (no type errors).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/cart/dto/
git commit -m "feat(cart): add/update cart-item DTOs"
```

---

### Task 4: Service — read path (`getCart` + `buildEnvelope`)

**Files:**
- Create: `apps/api/src/cart/cart.service.ts`
- Test: `apps/api/src/cart/cart.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`; `ConfigService`; `computeTotals`, `centsToString`, `TotalsLine` from `./totals`; `resolveTotalsConfig` from `./cart.config`.
- Produces:
  - `interface CartItemView { productId: string; name: string; unitPrice: string; quantity: number; lineTotal: string; image: string | null }`
  - `interface CartView { id: string; items: CartItemView[]; totals: CartTotals }`
  - `class CartService` with `getCart(userId: string): Promise<CartView>` (get-or-create) and a private `buildEnvelope`.
  - The Prisma include shape `CART_INCLUDE` (cart → items → product → images) reused by later methods.

The effective-unit-price helper resolves sale vs regular per the global constraint. Prices come off Prisma as `Decimal`; convert via the product's string form to integer cents.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/cart/cart.service.spec.ts
import { ProductStatus } from '@prisma/client';
import { CartService } from './cart.service';

const config = {
  taxRate: 0.1,
  shippingFlatCents: 500,
  freeShippingThresholdCents: 5000,
};

const makePrisma = () => ({
  cart: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  cartItem: {
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  product: {
    findFirst: jest.fn(),
  },
});

// ConfigService stub returning our fixed rates.
const makeConfig = () => ({
  get: (key: string) =>
    ({
      TAX_RATE: '0.1',
      SHIPPING_FLAT: '5.00',
      FREE_SHIPPING_THRESHOLD: '50.00',
    })[key],
});

const build = () => {
  const prisma = makePrisma();
  const svc = new CartService(prisma as never, makeConfig() as never);
  return { svc, prisma };
};

/** A persisted cart row with one ACTIVE product line priced at 19.99 x2. */
const cartWithLine = {
  id: 'cart1',
  items: [
    {
      productId: 'p1',
      quantity: 2,
      product: {
        id: 'p1',
        name: 'Mouse',
        price: '19.99',
        salePrice: null,
        status: ProductStatus.ACTIVE,
        images: [{ url: 'http://img/mouse.jpg', position: 0 }],
      },
    },
  ],
};

describe('CartService.getCart', () => {
  it('returns the existing cart with computed totals', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(cartWithLine);

    const view = await svc.getCart('u1');

    expect(prisma.cart.create).not.toHaveBeenCalled();
    expect(view.id).toBe('cart1');
    expect(view.items).toEqual([
      {
        productId: 'p1',
        name: 'Mouse',
        unitPrice: '19.99',
        quantity: 2,
        lineTotal: '39.98',
        image: 'http://img/mouse.jpg',
      },
    ]);
    expect(view.totals).toEqual({
      subtotal: '39.98',
      discountTotal: '0.00',
      taxTotal: '4.00',
      shippingTotal: '5.00',
      grandTotal: '48.98',
    });
  });

  it('creates an empty cart when the user has none', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(null);
    prisma.cart.create.mockResolvedValue({ id: 'new1', items: [] });

    const view = await svc.getCart('u1');

    expect(prisma.cart.create).toHaveBeenCalled();
    expect(view.id).toBe('new1');
    expect(view.items).toEqual([]);
    expect(view.totals.grandTotal).toBe('0.00');
  });

  it('uses the sale price when it is below the regular price', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue({
      id: 'cart1',
      items: [
        {
          productId: 'p1',
          quantity: 1,
          product: {
            id: 'p1',
            name: 'Mouse',
            price: '19.99',
            salePrice: '9.99',
            status: ProductStatus.ACTIVE,
            images: [],
          },
        },
      ],
    });

    const view = await svc.getCart('u1');
    expect(view.items[0].unitPrice).toBe('9.99');
    expect(view.items[0].lineTotal).toBe('9.99');
    expect(view.items[0].image).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/api test -- cart.service.spec`
Expected: FAIL — cannot find module `./cart.service`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// apps/api/src/cart/cart.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CartTotals,
  TotalsConfig,
  TotalsLine,
  centsToString,
  computeTotals,
} from './totals';
import { resolveTotalsConfig } from './cart.config';

/** One line as returned to the client. */
export interface CartItemView {
  productId: string;
  name: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  image: string | null;
}

/** The cart-with-totals envelope every endpoint returns. */
export interface CartView {
  id: string;
  items: CartItemView[];
  totals: CartTotals;
}

/** Cart → items → product (price/status/name) + ordered images. */
const CART_INCLUDE = {
  items: {
    include: {
      product: {
        include: { images: { orderBy: { position: 'asc' as const } } },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;
type LoadedItem = CartWithItems['items'][number];

/** Effective unit price in integer cents: sale price when strictly below regular. */
function effectiveUnitCents(price: string, salePrice: string | null): number {
  const regular = Math.round(Number(price) * 100);
  if (salePrice === null) return regular;
  const sale = Math.round(Number(salePrice) * 100);
  return sale < regular ? sale : regular;
}

@Injectable()
export class CartService {
  private readonly totalsConfig: TotalsConfig;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.totalsConfig = resolveTotalsConfig(config);
  }

  async getCart(userId: string): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    return this.buildEnvelope(cart);
  }

  /** Find the user's cart (with items) or create an empty one. */
  protected async getOrCreateCart(userId: string): Promise<CartWithItems> {
    const existing = await this.prisma.cart.findFirst({
      where: { userId },
      include: CART_INCLUDE,
    });
    if (existing) return existing;
    return this.prisma.cart.create({
      data: { userId },
      include: CART_INCLUDE,
    });
  }

  /** Map a loaded cart → priced envelope via the pure totals pipeline. */
  protected buildEnvelope(cart: CartWithItems): CartView {
    const items: CartItemView[] = [];
    const lines: TotalsLine[] = [];

    for (const item of cart.items) {
      const unitCents = effectiveUnitCents(
        item.product.price.toString(),
        item.product.salePrice ? item.product.salePrice.toString() : null,
      );
      const lineCents = unitCents * item.quantity;
      lines.push({ unitPriceCents: unitCents, quantity: item.quantity });
      items.push({
        productId: item.productId,
        name: item.product.name,
        unitPrice: centsToString(unitCents),
        quantity: item.quantity,
        lineTotal: centsToString(lineCents),
        image: item.product.images[0]?.url ?? null,
      });
    }

    return {
      id: cart.id,
      items,
      totals: computeTotals(lines, this.totalsConfig),
    };
  }

  /** Load an ACTIVE product or throw: 404 if absent, 400 if not purchasable. */
  protected async requirePurchasableProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Product is not available for purchase');
    }
  }

  // Reference so the linter does not flag the imported type before Task 5 uses it.
  protected readonly _loadedItemRef?: LoadedItem;
}
```

> Note: the `_loadedItemRef` placeholder and `requirePurchasableProduct` are added here so Task 5 can build on them without re-touching imports. If your linter rejects the unused-member reference, simply omit `LoadedItem`/`_loadedItemRef` — they are conveniences, not required by Task 4's tests.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix apps/api test -- cart.service.spec`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cart/cart.service.ts apps/api/src/cart/cart.service.spec.ts
git commit -m "feat(cart): service read path — get-or-create cart with totals"
```

---

### Task 5: Service — mutation path (add / set-qty / remove / clear)

**Files:**
- Modify: `apps/api/src/cart/cart.service.ts`
- Modify: `apps/api/src/cart/cart.service.spec.ts`

**Interfaces:**
- Consumes: everything from Task 4 (`getOrCreateCart`, `buildEnvelope`, `requirePurchasableProduct`, `CART_INCLUDE`).
- Produces, on `CartService`:
  - `addItem(userId: string, productId: string, quantity: number): Promise<CartView>` — validates product, upserts the line (increments if present), reloads.
  - `setItemQuantity(userId: string, productId: string, quantity: number): Promise<CartView>` — `0` removes; else validates product + sets absolute quantity.
  - `removeItem(userId: string, productId: string): Promise<CartView>` — idempotent delete.
  - `clear(userId: string): Promise<CartView>` — delete all lines.

- [ ] **Step 1: Add the failing tests**

Append to `apps/api/src/cart/cart.service.spec.ts`:

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common';

/** A bare cart row (no lines) used to anchor mutations. */
const emptyCart = { id: 'cart1', userId: 'u1', items: [] };

describe('CartService.addItem', () => {
  it('rejects an unknown product with 404', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(emptyCart);
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(svc.addItem('u1', 'nope', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a non-ACTIVE product with 400', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(emptyCart);
    prisma.product.findFirst.mockResolvedValue({
      id: 'p1',
      status: ProductStatus.ARCHIVED,
    });

    await expect(svc.addItem('u1', 'p1', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('upserts the line (increment on conflict) then returns the envelope', async () => {
    const { svc, prisma } = build();
    // First findFirst: getOrCreate in addItem. Second: reload in getCart.
    prisma.cart.findFirst
      .mockResolvedValueOnce(emptyCart)
      .mockResolvedValueOnce(cartWithLine);
    prisma.product.findFirst.mockResolvedValue({
      id: 'p1',
      status: ProductStatus.ACTIVE,
    });
    prisma.cartItem.upsert.mockResolvedValue({});

    const view = await svc.addItem('u1', 'p1', 2);

    const [call] = prisma.cartItem.upsert.mock.calls as Array<[any]>;
    expect(call[0].create).toEqual(
      expect.objectContaining({ cartId: 'cart1', productId: 'p1', quantity: 2 }),
    );
    expect(call[0].update).toEqual({ quantity: { increment: 2 } });
    expect(view.totals.grandTotal).toBe('48.98');
  });
});

describe('CartService.setItemQuantity', () => {
  it('removes the line when quantity is 0', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst
      .mockResolvedValueOnce(emptyCart)
      .mockResolvedValueOnce(emptyCart);
    prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

    await svc.setItemQuantity('u1', 'p1', 0);

    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart1', productId: 'p1' },
    });
    expect(prisma.cartItem.update).not.toHaveBeenCalled();
  });

  it('sets the absolute quantity for a positive value', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst
      .mockResolvedValueOnce(emptyCart)
      .mockResolvedValueOnce(cartWithLine);
    prisma.product.findFirst.mockResolvedValue({
      id: 'p1',
      status: ProductStatus.ACTIVE,
    });
    prisma.cartItem.update.mockResolvedValue({});

    await svc.setItemQuantity('u1', 'p1', 5);

    const [call] = prisma.cartItem.update.mock.calls as Array<[any]>;
    expect(call[0].data).toEqual({ quantity: 5 });
  });
});

describe('CartService.removeItem', () => {
  it('deletes the line and returns the envelope (idempotent)', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst
      .mockResolvedValueOnce(emptyCart)
      .mockResolvedValueOnce(emptyCart);
    prisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });

    const view = await svc.removeItem('u1', 'p1');

    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart1', productId: 'p1' },
    });
    expect(view.items).toEqual([]);
  });
});

describe('CartService.clear', () => {
  it('deletes all lines in the cart', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst
      .mockResolvedValueOnce(emptyCart)
      .mockResolvedValueOnce(emptyCart);
    prisma.cartItem.deleteMany.mockResolvedValue({ count: 3 });

    await svc.clear('u1');

    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart1' },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/api test -- cart.service.spec`
Expected: FAIL — `svc.addItem`/`setItemQuantity`/`removeItem`/`clear` are not functions.

- [ ] **Step 3: Add the mutation methods**

Remove the `_loadedItemRef` placeholder line from Task 4 and add these methods to `CartService` (after `getCart`):

```typescript
  async addItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    await this.requirePurchasableProduct(productId);
    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      create: { cartId: cart.id, productId, quantity },
      update: { quantity: { increment: quantity } },
    });
    return this.getCart(userId);
  }

  async setItemQuantity(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    if (quantity === 0) {
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id, productId },
      });
      return this.getCart(userId);
    }
    await this.requirePurchasableProduct(productId);
    await this.prisma.cartItem.update({
      where: { cartId_productId: { cartId: cart.id, productId } },
      data: { quantity },
    });
    return this.getCart(userId);
  }

  async removeItem(userId: string, productId: string): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id, productId },
    });
    return this.getCart(userId);
  }

  async clear(userId: string): Promise<CartView> {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(userId);
  }
```

> `cartId_productId` is the Prisma compound-unique selector generated from the schema's `@@unique([cartId, productId])`. `deleteMany` is used for removal so an absent line is a no-op (idempotent) rather than a `P2025` throw.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix apps/api test -- cart.service.spec`
Expected: PASS (all read + mutation cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cart/cart.service.ts apps/api/src/cart/cart.service.spec.ts
git commit -m "feat(cart): service mutations — add/set-qty/remove/clear"
```

---

### Task 6: Controller + module wiring

**Files:**
- Create: `apps/api/src/cart/cart.controller.ts`
- Modify: `apps/api/src/cart/cart.module.ts` (replace the empty stub)

**Interfaces:**
- Consumes: `CartService` (Tasks 4–5), `AddCartItemDto`/`UpdateCartItemDto` (Task 3), `@CurrentUser()` (`AccessTokenPayload`), `@Roles(Role.CUSTOMER)`.
- Produces: HTTP routes per the spec; `CartModule` wiring (`imports: [PrismaModule]`, controller + service). `ConfigService` is available because `ConfigModule.forRoot({ isGlobal: true })` is registered in `AppModule`.

No new unit test — the controller is a thin pass-through verified by the Task 7 smoke run, matching how `products.controller.ts` is covered.

- [ ] **Step 1: Write the controller**

```typescript
// apps/api/src/cart/cart.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenPayload } from '../auth/auth-tokens';

/**
 * Customer-scoped shopping cart. Every route operates on the caller's own
 * active cart (resolved from the access token) — no cart id in any path, so
 * ownership can't be spoofed. Role boundary enforced by the global RolesGuard.
 */
@Roles(Role.CUSTOMER)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: AccessTokenPayload) {
    return this.cart.getCart(user.sub);
  }

  @Post('items')
  addItem(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cart.addItem(user.sub, dto.productId, dto.quantity);
  }

  @Patch('items/:productId')
  setQuantity(
    @CurrentUser() user: AccessTokenPayload,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.setItemQuantity(user.sub, productId, dto.quantity);
  }

  @Delete('items/:productId')
  removeItem(
    @CurrentUser() user: AccessTokenPayload,
    @Param('productId') productId: string,
  ) {
    return this.cart.removeItem(user.sub, productId);
  }

  @Delete()
  clear(@CurrentUser() user: AccessTokenPayload) {
    return this.cart.clear(user.sub);
  }
}
```

- [ ] **Step 2: Wire the module**

Replace the contents of `apps/api/src/cart/cart.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

/** Cart domain: items + server-authoritative totals pipeline. (Phase 4) */
@Module({
  imports: [PrismaModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
```

- [ ] **Step 3: Build, lint, and run the full unit suite**

Run: `npm --prefix apps/api run build && npm --prefix apps/api run lint && npm --prefix apps/api test`
Expected: build clean; lint clean; all tests green (existing + new cart tests).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/cart/cart.controller.ts apps/api/src/cart/cart.module.ts
git commit -m "feat(cart): customer-scoped /cart controller + module wiring"
```

---

### Task 7: HTTP smoke run + PLAN.md update

**Files:**
- Modify: `PLAN.md` (Phase 4 checkbox + status table + status note)

**Interfaces:** none (verification + docs).

This is the RULE.md §5 gate: unit tests mock Prisma and can't prove the app boots and serves. Smoke the real thing against `ecom_dev`.

- [ ] **Step 1: Start the API**

Run (background): `npm --prefix apps/api run start:dev`
Wait for `Nest application successfully started` on `:5000`.

- [ ] **Step 2: Get a CUSTOMER access token**

Use a seeded customer (check the seed script for credentials, e.g. `apps/api/prisma/seed.ts`). Then:

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<customer-email>","password":"<password>"}' | jq -r .accessToken)
echo "$TOKEN" | head -c 20
```

- [ ] **Step 3: Exercise the cart and confirm totals + boundaries**

```bash
AUTH="Authorization: Bearer $TOKEN"
J="Content-Type: application/json"
PID="<a-real-ACTIVE-product-id-from-GET-/products>"

# Empty cart
curl -s -H "$AUTH" http://localhost:5000/cart | jq .totals
# Add 2 -> totals reflect tax + flat shipping (or free if over threshold)
curl -s -X POST -H "$AUTH" -H "$J" http://localhost:5000/cart/items \
  -d "{\"productId\":\"$PID\",\"quantity\":2}" | jq '{items,totals}'
# Set qty to 1
curl -s -X PATCH -H "$AUTH" -H "$J" "http://localhost:5000/cart/items/$PID" \
  -d '{"quantity":1}' | jq .totals
# Remove
curl -s -X DELETE -H "$AUTH" "http://localhost:5000/cart/items/$PID" | jq .items
# Clear
curl -s -X DELETE -H "$AUTH" http://localhost:5000/cart | jq .items

# Boundaries
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/cart          # 401 (no token)
# Add unknown product -> 404
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "$AUTH" -H "$J" \
  http://localhost:5000/cart/items -d '{"productId":"does-not-exist","quantity":1}'
# Add an ARCHIVED product -> 400 (archive one via admin first, or pick a known archived id)
```

Expected: totals match the pure-pipeline math (subtotal from live prices, tax = subtotal×0.10 rounded, flat $5 shipping under $50 else free, grand = subtotal+tax+shipping); free-shipping threshold flips correctly when subtotal ≥ $50; no token → `401`; unknown product → `404`; archived product → `400`. Confirm an ADMIN token gets `403` on `GET /cart`.

- [ ] **Step 4: Stop the API and record the smoke result**

Stop the background dev server.

- [ ] **Step 5: Update PLAN.md**

- Tick the Phase 4 API checkbox line (the `API: server-authoritative cart...` item) → `[x]`.
- Set the Phase 4 row in the status table to `🟡 In Progress` with a note that the cart+totals API slice is done.
- Append a short status note (mirroring the Phase 3 note style): endpoints shipped, totals rules, test counts, smoke result vs `ecom_dev`, branch `feat/api-cart`, and that order-placement/cart-UI/checkout-UI remain.

- [ ] **Step 6: Commit**

```bash
git add PLAN.md
git commit -m "docs(phase4): mark cart+totals API slice done; update PLAN status"
```

---

## Self-Review

**1. Spec coverage:**
- Singular `/cart` endpoints (get/add/set-qty/remove/clear) → Task 6 controller; service logic Tasks 4–5. ✅
- Pure five-stage totals pipeline, integer cents, 2-dp strings → Task 1. ✅
- `discountTotal` always 0 → Task 1 (`discountTotal = 0`). ✅
- Env-backed tax/shipping config + defaults + `.env.example` → Task 2. ✅
- Live effective price (sale when strictly below regular) → Task 4 `effectiveUnitCents` + test. ✅
- CUSTOMER-only authorization → Task 6 `@Roles(Role.CUSTOMER)`; smoke 401/403 → Task 7. ✅
- Errors: unknown product 404, non-ACTIVE 400, qty<1 400 (DTO), qty 0 removes → Tasks 3/5 + smoke. ✅
- Idempotent remove, increment-on-readd, free-shipping boundary → Tasks 1/5 tests. ✅
- Smoke run vs `ecom_dev` (RULE.md §5) + PLAN.md update → Task 7. ✅
- Out-of-scope (guest cart, order placement, stock gating, payment, audit) → not built. ✅

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" — every code step has full code; every test has assertions; every command has expected output. The one `_loadedItemRef` convenience in Task 4 is explicitly explained and removed in Task 5. ✅

**3. Type consistency:** `computeTotals`/`centsToString`/`TotalsLine`/`TotalsConfig`/`CartTotals` (Task 1) are consumed unchanged in Tasks 2/4. `CartView`/`CartItemView` (Task 4) are returned by all service methods (Task 5) and the controller (Task 6). `addItem(userId, productId, quantity)`, `setItemQuantity`, `removeItem`, `clear` signatures match between Task 5 definitions and Task 6 calls. `cartId_productId` compound key matches the schema's `@@unique([cartId, productId])`. ✅
