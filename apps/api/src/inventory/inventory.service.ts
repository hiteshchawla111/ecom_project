import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ManualMovementType } from './dto/create-movement.dto';
import { LOW_STOCK_EVENT, LowStockEvent } from './inventory.events';

/** Compile-time exhaustiveness guard for switch statements. */
function assertNever(value: never): never {
  throw new BadRequestException(`Unsupported movement type: ${String(value)}`);
}

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
  ): Promise<LowStockEvent | null> {
    const item = await this.requireItem(productId, tx);
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
  ): Promise<void> {
    const item = await this.requireItem(productId, tx);
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
  ): Promise<void> {
    const item = await this.requireItem(productId, tx);
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
    productId: string,
    input: { type: ManualMovementType; quantity: number; reason: string },
  ): Promise<void> {
    const { type, quantity, reason } = input;
    const item = await this.requireItem(productId);

    switch (type) {
      case MovementType.ADDITION:
        // A zero-unit addition is a no-op that would only pollute the ledger.
        if (quantity < 1) {
          throw new BadRequestException('Addition quantity must be at least 1');
        }
        await this.apply(item.id, {
          counters: { available: { increment: quantity } },
          type,
          delta: quantity,
          reason,
        });
        return;

      case MovementType.DEDUCTION:
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
        await this.apply(item.id, {
          counters: { available: { decrement: quantity } },
          type,
          delta: -quantity,
          reason,
        });
        this.emitIfCrossedLow(item, item.available - quantity);
        return;

      case MovementType.ADJUSTMENT:
        // A recount may legitimately set available to 0; record the signed
        // difference from the old count (no-op recounts write a 0-delta row,
        // which is acceptable as an audit trail of the count itself).
        await this.apply(item.id, {
          counters: { available: { set: quantity } },
          type,
          delta: quantity - item.available,
          reason,
        });
        this.emitIfCrossedLow(item, quantity);
        return;

      default:
        // Exhaustive: `type` is narrowed to ManualMovementType, so this is
        // unreachable. The `never` assertion makes a future enum addition a
        // compile error rather than a silent runtime fall-through.
        return assertNever(type);
    }
  }

  private async requireItem(productId: string, tx?: Prisma.TransactionClient) {
    const db: PrismaLike = tx ?? this.prisma;
    const item = await db.inventoryItem.findUnique({ where: { productId } });
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
    item: { productId: string; available: number; lowStockThreshold: number },
    newAvailable: number,
  ): LowStockEvent | null {
    const { productId, available: before, lowStockThreshold: threshold } = item;
    if (before > threshold && newAvailable <= threshold) {
      return { productId, available: newAvailable, threshold };
    }
    return null;
  }

  /** Emit the crossing event for an immediate-commit op, if any. */
  private emitIfCrossedLow(
    item: { productId: string; available: number; lowStockThreshold: number },
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
