import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserve `quantity` units for a (possibly order-linked) hold: moves stock
   * from `available` to `reserved`. Rejects if `available` is insufficient
   * (no overselling) or the product has no inventory item.
   */
  async reserve(
    productId: string,
    quantity: number,
    orderId?: string,
  ): Promise<void> {
    const item = await this.requireItem(productId);
    if (item.available < quantity) {
      throw new BadRequestException('Insufficient stock available to reserve');
    }
    await this.apply(item.id, {
      counters: {
        available: { decrement: quantity },
        reserved: { increment: quantity },
      },
      type: MovementType.RESERVATION,
      delta: -quantity,
      orderId,
    });
  }

  /**
   * Release `quantity` reserved units back to `available` (e.g. order
   * cancellation). Rejects if more than the currently reserved amount.
   */
  async release(
    productId: string,
    quantity: number,
    orderId?: string,
  ): Promise<void> {
    const item = await this.requireItem(productId);
    if (item.reserved < quantity) {
      throw new BadRequestException('Cannot release more than is reserved');
    }
    await this.apply(item.id, {
      counters: {
        available: { increment: quantity },
        reserved: { decrement: quantity },
      },
      type: MovementType.RELEASE,
      delta: quantity,
      orderId,
    });
  }

  /**
   * Deduct `quantity` reserved units on fulfillment: the goods leave, so the
   * reserved hold is consumed (`available` is untouched — it was already
   * decremented at reservation). Rejects if more than is reserved.
   */
  async deduct(
    productId: string,
    quantity: number,
    orderId?: string,
  ): Promise<void> {
    const item = await this.requireItem(productId);
    if (item.reserved < quantity) {
      throw new BadRequestException('Cannot deduct more than is reserved');
    }
    await this.apply(item.id, {
      counters: { reserved: { decrement: quantity } },
      type: MovementType.DEDUCTION,
      delta: -quantity,
      orderId,
    });
  }

  private async requireItem(productId: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { productId },
    });
    if (!item) {
      throw new NotFoundException('No inventory item for this product');
    }
    return item;
  }

  /**
   * Apply a counter update and append its movement in one transaction, so the
   * ledger and the counters can never diverge.
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
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: move.counters,
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId,
          type: move.type,
          quantity: move.delta,
          orderId: move.orderId ?? null,
          reason: move.reason ?? null,
        },
      });
    });
  }
}
