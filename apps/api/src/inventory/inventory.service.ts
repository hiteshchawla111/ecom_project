import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MovementType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { INVENTORY_ADJUSTED } from '../audit/audit-actions';
import type { AccessTokenPayload } from '../auth/auth-tokens';
import { ManualMovementType } from './dto/create-movement.dto';
import { ListStockDto } from './dto/list-stock.dto';
import { LOW_STOCK_EVENT, LowStockEvent } from './inventory.events';
import { buildSellerScope, ScopeActor } from '../products/seller-scope';

/** A system-level actor used for order-driven operations (reserve/release/deduct/restock)
 *  that are not scoped to a specific seller. */
const SYSTEM_ACTOR: ScopeActor = { role: Role.ADMIN };

/** Compile-time exhaustiveness guard for switch statements. */
function assertNever(value: never): never {
  throw new BadRequestException(`Unsupported movement type: ${String(value)}`);
}

/** A row in the admin stock list: counters + product identity + low flag. */
export interface StockRow {
  productId: string;
  name: string;
  sku: string;
  available: number;
  reserved: number;
  lowStockThreshold: number;
  isLowStock: boolean;
}

/** A single ledger movement as exposed to admins. */
export interface MovementView {
  type: MovementType;
  quantity: number;
  reason: string | null;
  orderId: string | null;
  createdAt: Date;
}

/** A stock item's full view: counters + product identity + recent movements. */
export interface StockItemView extends StockRow {
  movements: MovementView[];
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Aggregate inventory health for a scope (a single seller, or all sellers for
 * admin). Valuation is money, so it stays a fixed-precision string — never a
 * JS float.
 */
export interface InventoryReport {
  totalProducts: number;
  totalAvailable: number;
  totalReserved: number;
  lowStockCount: number;
  outOfStockCount: number;
  /** Σ(available × Product.price) over the scope, as a Decimal string. */
  valuation: string;
}

/** How many recent movements `getStockItem` returns. */
const MOVEMENT_HISTORY_LIMIT = 50;

/**
 * Inventory ledger. The single authority over available vs. reserved stock.
 *
 * Stock never changes by a raw quantity write: every change is an append-only
 * {@link InventoryMovement} paired atomically with the counter update, so the
 * movement log always reconstructs the current `available`/`reserved`.
 *
 *   reserve  — order placement: available → reserved (cannot oversell)
 *   release  — order cancellation: reserved → available
 *   deduct   — fulfillment: stock leaves; reserved decreases
 *
 * Order-flow wiring (reserve on placement, release on cancel, deduct on
 * fulfillment) is layered on top of these primitives in later Phase 5 slices.
 */
/**
 * A Prisma client that can run reads/writes — either the root client or a
 * transaction client. Lets the ledger ops join a caller's transaction.
 */
type PrismaLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
  ) {}

  /**
   * Reserve `quantity` units for a (possibly order-linked) hold: moves stock
   * from `available` to `reserved`. Rejects if `available` is insufficient
   * (no overselling) or the product has no inventory item.
   *
   * Pass `tx` to join a caller's transaction (e.g. order placement), so the
   * reservation commits/rolls back atomically with the order.
   */
  async reserve(
    productId: string,
    quantity: number,
    orderId?: string,
    tx?: Prisma.TransactionClient,
    subOrderId?: string,
  ): Promise<LowStockEvent | null> {
    const item = await this.requireItem(productId, SYSTEM_ACTOR, tx);
    if (item.available < quantity) {
      throw new BadRequestException('Insufficient stock available to reserve');
    }
    await this.apply(
      item.id,
      {
        counters: {
          available: { decrement: quantity },
          reserved: { increment: quantity },
        },
        type: MovementType.RESERVATION,
        delta: -quantity,
        orderId,
        subOrderId,
      },
      tx,
    );
    const crossing = this.lowStockCrossing(item, item.available - quantity);
    // Standalone call (immediate commit): emit now. When joined to a caller's
    // tx, the write isn't committed until that tx returns — so we return the
    // crossing for the caller to emit *after* commit (no false alert on a
    // rolled-back placement, and no shared mutable state on this singleton).
    if (crossing && !tx) {
      this.events.emit(LOW_STOCK_EVENT, crossing);
      return null;
    }
    return crossing;
  }

  /** Emit a low-stock event that a caller deferred until after its commit. */
  emitLowStock(event: LowStockEvent): void {
    this.events.emit(LOW_STOCK_EVENT, event);
  }

  /**
   * Release `quantity` reserved units back to `available` (e.g. order
   * cancellation). Rejects if more than the currently reserved amount.
   * Pass `tx` to join a caller's transaction.
   */
  async release(
    productId: string,
    quantity: number,
    orderId?: string,
    tx?: Prisma.TransactionClient,
    subOrderId?: string,
  ): Promise<void> {
    const item = await this.requireItem(productId, SYSTEM_ACTOR, tx);
    if (item.reserved < quantity) {
      throw new BadRequestException('Cannot release more than is reserved');
    }
    await this.apply(
      item.id,
      {
        counters: {
          available: { increment: quantity },
          reserved: { decrement: quantity },
        },
        type: MovementType.RELEASE,
        delta: quantity,
        orderId,
        subOrderId,
      },
      tx,
    );
  }

  /**
   * Deduct `quantity` reserved units on fulfillment: the goods leave, so the
   * reserved hold is consumed (`available` is untouched — it was already
   * decremented at reservation). Rejects if more than is reserved.
   * Pass `tx` to join a caller's transaction.
   */
  async deduct(
    productId: string,
    quantity: number,
    orderId?: string,
    tx?: Prisma.TransactionClient,
    subOrderId?: string,
  ): Promise<void> {
    const item = await this.requireItem(productId, SYSTEM_ACTOR, tx);
    if (item.reserved < quantity) {
      throw new BadRequestException('Cannot deduct more than is reserved');
    }
    await this.apply(
      item.id,
      {
        counters: { reserved: { decrement: quantity } },
        type: MovementType.DEDUCTION,
        delta: -quantity,
        orderId,
        subOrderId,
      },
      tx,
    );
  }

  /**
   * Return goods to available stock on a refund (`DELIVERED → REFUNDED`):
   * `available += quantity`, recorded as an ADDITION movement (reason
   * "refund"). Pass `tx` to join the caller's transaction so the restock
   * commits/rolls back atomically with the status change.
   */
  async restock(
    productId: string,
    quantity: number,
    orderId?: string,
    tx?: Prisma.TransactionClient,
    subOrderId?: string,
  ): Promise<void> {
    const item = await this.requireItem(productId, SYSTEM_ACTOR, tx);
    await this.apply(
      item.id,
      {
        counters: { available: { increment: quantity } },
        type: MovementType.ADDITION,
        delta: quantity,
        orderId,
        subOrderId,
        reason: 'refund',
      },
      tx,
    );
  }

  /**
   * Manual stock adjustment by an admin / inventory manager. Operates on
   * `available` (never `reserved` — order holds are system-driven) and records
   * the change as a movement with a required `reason`:
   *
   *   ADDITION   — receive `quantity` new units (available += quantity)
   *   DEDUCTION  — remove `quantity` units, e.g. damaged/lost (available -= quantity)
   *   ADJUSTMENT — set available to the absolute `quantity` (a recount); the
   *                movement records the signed difference from the old count
   *
   * Order-driven types (RESERVATION/RELEASE) are not permitted here.
   */
  async adjust(
    actor: AccessTokenPayload & { sellerId?: string },
    productId: string,
    input: { type: ManualMovementType; quantity: number; reason: string },
  ): Promise<void> {
    const { type, quantity, reason } = input;
    const item = await this.requireItem(productId, actor);

    switch (type) {
      case MovementType.ADDITION: {
        // A zero-unit addition is a no-op that would only pollute the ledger.
        if (quantity < 1) {
          throw new BadRequestException('Addition quantity must be at least 1');
        }
        const delta = quantity;
        await this.applyWithAudit(actor, productId, item.id, {
          counters: { available: { increment: quantity } },
          type,
          delta,
          reason,
        });
        return;
      }

      case MovementType.DEDUCTION: {
        if (quantity < 1) {
          throw new BadRequestException(
            'Deduction quantity must be at least 1',
          );
        }
        if (item.available < quantity) {
          throw new BadRequestException(
            'Cannot deduct more than the available stock',
          );
        }
        const delta = -quantity;
        await this.applyWithAudit(actor, productId, item.id, {
          counters: { available: { decrement: quantity } },
          type,
          delta,
          reason,
        });
        this.emitIfCrossedLow(item, item.available - quantity);
        return;
      }

      case MovementType.ADJUSTMENT: {
        // A recount may legitimately set available to 0; record the signed
        // difference from the old count (no-op recounts write a 0-delta row,
        // which is acceptable as an audit trail of the count itself).
        const delta = quantity - item.available;
        await this.applyWithAudit(actor, productId, item.id, {
          counters: { available: { set: quantity } },
          type,
          delta,
          reason,
        });
        this.emitIfCrossedLow(item, quantity);
        return;
      }

      default:
        // Exhaustive: `type` is narrowed to ManualMovementType, so this is
        // unreachable. The `never` assertion makes a future enum addition a
        // compile error rather than a silent runtime fall-through.
        return assertNever(type);
    }
  }

  /**
   * Wraps the apply+audit pair in a single transaction. All three manual-
   * adjustment branches share identical tx/apply/audit logic — only the
   * counters and delta differ. Extracted to remove duplication (DRY).
   */
  private async applyWithAudit(
    actor: AccessTokenPayload & { sellerId?: string },
    productId: string,
    inventoryItemId: string,
    move: {
      counters: Prisma.InventoryItemUpdateInput;
      type: MovementType;
      delta: number;
      reason?: string | null;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.apply(inventoryItemId, move, tx);
      await this.audit.record(
        {
          actorId: actor.sub,
          action: INVENTORY_ADJUSTED,
          entityType: 'InventoryItem',
          entityId: productId,
          metadata: {
            type: move.type,
            delta: move.delta,
            reason: move.reason ?? null,
          },
        },
        tx,
      );
    });
  }

  /**
   * Admin/inventory-manager stock list: per-product available vs. reserved with
   * a computed `isLowStock` flag. `lowStock=true` filters to rows where
   * `available <= lowStockThreshold` — a column-to-column comparison Prisma's
   * `where` can't express, so those productIds are resolved with a raw query
   * first, then loaded normally (keeps the typed select + pagination).
   */
  async listStock(
    query: ListStockDto,
    actor: ScopeActor,
  ): Promise<Paginated<StockRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const select = {
      productId: true,
      available: true,
      reserved: true,
      lowStockThreshold: true,
      product: { select: { name: true, sku: true } },
    } satisfies Prisma.InventoryItemSelect;

    // The low-stock filter is a column-to-column comparison Prisma's `where`
    // can't express, so resolve the matching productIds with a raw query first.
    // All three reads run in one transaction so the resolved id set, the page,
    // and the count come from a single consistent snapshot.
    const { items, total } = await this.prisma.$transaction(async (tx) => {
      let where: Prisma.InventoryItemWhereInput = {
        ...buildSellerScope(actor),
      };
      if (query.lowStock) {
        const rows = await tx.$queryRaw<{ productId: string }[]>`
          SELECT "productId" FROM "InventoryItem"
          WHERE "available" <= "lowStockThreshold"
        `;
        where = {
          ...buildSellerScope(actor),
          productId: { in: rows.map((r) => r.productId) },
        };
      }
      const [pageItems, count] = await Promise.all([
        tx.inventoryItem.findMany({
          where,
          orderBy: { product: { name: 'asc' } },
          skip,
          take: pageSize,
          select,
        }),
        tx.inventoryItem.count({ where }),
      ]);
      return { items: pageItems, total: count };
    });

    return {
      data: items.map((it) => this.toStockRow(it)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Admin/inventory-manager stock detail: counters + product identity + the
   * most recent movements (newest-first). 404 if the product has no item.
   */
  async getStockItem(
    productId: string,
    actor: ScopeActor,
  ): Promise<StockItemView> {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { productId, ...buildSellerScope(actor) },
      select: {
        productId: true,
        available: true,
        reserved: true,
        lowStockThreshold: true,
        product: { select: { name: true, sku: true } },
        movements: {
          orderBy: { createdAt: 'desc' },
          take: MOVEMENT_HISTORY_LIMIT,
          select: {
            type: true,
            quantity: true,
            reason: true,
            orderId: true,
            createdAt: true,
          },
        },
      },
    });
    if (!item) {
      throw new NotFoundException('No inventory item for this product');
    }
    return { ...this.toStockRow(item), movements: item.movements };
  }

  /**
   * Aggregate inventory health for a scope: a single seller (SELLER actor) or
   * all sellers (ADMIN / INVENTORY_MANAGER). Counts that Prisma's `where` can
   * express (total products, out-of-stock) use scoped `count`; the unit sums,
   * the low-stock count (a column-to-column `available <= lowStockThreshold`
   * comparison), and the valuation (`Σ available × Product.price`, money math)
   * come from one raw summary query. All reads run in one transaction so the
   * figures come from a single consistent snapshot.
   */
  async report(actor: ScopeActor): Promise<InventoryReport> {
    const scope = buildSellerScope(actor);
    // Parameterized seller filter for the raw query (empty for admin). Prisma's
    // tagged-template `$queryRaw` parameterizes interpolated values, so this is
    // injection-safe even though it's string-composed.
    const sellerFilter = scope.sellerId
      ? Prisma.sql`WHERE i."sellerId" = ${scope.sellerId}`
      : Prisma.empty;

    const { totalProducts, outOfStockCount, summary } =
      await this.prisma.$transaction(async (tx) => {
        const [total, outOfStock, rows] = await Promise.all([
          tx.inventoryItem.count({ where: { ...scope } }),
          tx.inventoryItem.count({ where: { ...scope, available: 0 } }),
          tx.$queryRaw<
            {
              available: bigint | number | null;
              reserved: bigint | number | null;
              lowStock: bigint | number | null;
              valuation: string | null;
            }[]
          >`
            SELECT
              SUM(i."available")                              AS "available",
              SUM(i."reserved")                               AS "reserved",
              COUNT(*) FILTER (
                WHERE i."available" <= i."lowStockThreshold"
              )                                               AS "lowStock",
              -- numeric(2dp) then ::text so it arrives as a literal 2-dp string;
              -- a Prisma Decimal's toString() would drop the trailing zero
              -- (11824.50 -> "11824.5"), breaking the money format.
              SUM(i."available" * p."price")::numeric(38,2)::text AS "valuation"
            FROM "InventoryItem" i
            JOIN "Product" p ON p."id" = i."productId"
            ${sellerFilter}
          `,
        ]);
        return {
          totalProducts: total,
          outOfStockCount: outOfStock,
          summary: rows[0],
        };
      });

    return {
      totalProducts,
      totalAvailable: Number(summary?.available ?? 0),
      totalReserved: Number(summary?.reserved ?? 0),
      lowStockCount: Number(summary?.lowStock ?? 0),
      outOfStockCount,
      // Money: keep fixed precision; an empty scope's SUM is SQL NULL → "0.00".
      valuation:
        summary?.valuation == null ? '0.00' : String(summary.valuation),
    };
  }

  /** Map an inventory row (+product) to the admin StockRow shape. */
  private toStockRow(it: {
    productId: string;
    available: number;
    reserved: number;
    lowStockThreshold: number;
    product: { name: string; sku: string };
  }): StockRow {
    return {
      productId: it.productId,
      name: it.product.name,
      sku: it.product.sku,
      available: it.available,
      reserved: it.reserved,
      lowStockThreshold: it.lowStockThreshold,
      isLowStock: it.available <= it.lowStockThreshold,
    };
  }

  private async requireItem(
    productId: string,
    actor: ScopeActor,
    tx?: Prisma.TransactionClient,
  ) {
    const db: PrismaLike = tx ?? this.prisma;
    const item = await db.inventoryItem.findFirst({
      where: { productId, ...buildSellerScope(actor) },
    });
    if (!item) {
      throw new NotFoundException('No inventory item for this product');
    }
    return item;
  }

  /**
   * Build a low-stock event when `available` crosses *down* through the item's
   * threshold (was strictly above, now at or below), else null. Only the
   * downward crossing qualifies, so a product that stays low doesn't re-alert
   * on every subsequent change. A threshold of 0 only fires at depletion.
   */
  private lowStockCrossing(
    item: {
      productId: string;
      available: number;
      lowStockThreshold: number;
      sellerId: string;
    },
    newAvailable: number,
  ): LowStockEvent | null {
    const {
      productId,
      available: before,
      lowStockThreshold: threshold,
      sellerId,
    } = item;
    if (before > threshold && newAvailable <= threshold) {
      return { productId, available: newAvailable, threshold, sellerId };
    }
    return null;
  }

  /** Emit the crossing event for an immediate-commit op, if any. */
  private emitIfCrossedLow(
    item: {
      productId: string;
      available: number;
      lowStockThreshold: number;
      sellerId: string;
    },
    newAvailable: number,
  ): void {
    const crossing = this.lowStockCrossing(item, newAvailable);
    if (crossing) {
      this.events.emit(LOW_STOCK_EVENT, crossing);
    }
  }

  /**
   * Apply a counter update and append its movement so the ledger and the
   * counters can never diverge. Runs in `tx` if given (joining the caller's
   * transaction); otherwise opens its own transaction.
   */
  private async apply(
    inventoryItemId: string,
    move: {
      counters: Prisma.InventoryItemUpdateInput;
      type: MovementType;
      delta: number;
      orderId?: string;
      subOrderId?: string;
      reason?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (db: PrismaLike) => {
      await db.inventoryItem.update({
        where: { id: inventoryItemId },
        data: move.counters,
      });
      await db.inventoryMovement.create({
        data: {
          inventoryItemId,
          type: move.type,
          quantity: move.delta,
          orderId: move.orderId ?? null,
          subOrderId: move.subOrderId ?? null,
          reason: move.reason ?? null,
        },
      });
    };
    if (tx) {
      await run(tx);
    } else {
      await this.prisma.$transaction(run);
    }
  }
}
