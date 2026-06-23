import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LowStockEvent } from '../inventory/inventory.events';
import {
  SELLER_REGISTERED,
  SELLER_KYC_APPROVED,
  SELLER_KYC_REJECTED,
  SellerRegisteredEvent,
  SellerKycEvent,
} from '../sellers/seller-events';

/**
 * Persists domain-event notifications. This is the sink for events emitted
 * elsewhere (e.g. inventory low-stock); delivery/consumption UX is Phase 6.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a low-stock alert for both the admin/staff queue and the owning
   * seller. The admin notification always writes (userId: null). If the seller
   * can be resolved, a second seller-targeted notification is written. If the
   * seller is gone (deleted between event emit and handler), the admin alert
   * still stands — do not throw.
   */
  async recordLowStock(event: LowStockEvent): Promise<void> {
    // LowStockEvent is structurally valid JSON; the double cast is the
    // canonical bridge to Prisma's InputJsonValue (its JSON typing can't
    // infer a plain interface as assignable).
    const payload = event as unknown as Prisma.InputJsonValue;

    // Admin/staff queue (unchanged).
    await this.prisma.notification.create({
      data: { type: NotificationType.LOW_STOCK, userId: null, payload },
    });

    // Owning-seller alert: resolve the seller's user. If the seller is gone,
    // the admin alert above still stands — don't fail the whole write.
    const seller = await this.prisma.seller.findUnique({
      where: { id: event.sellerId },
      select: { userId: true },
    });
    if (seller) {
      await this.prisma.notification.create({
        data: {
          type: NotificationType.LOW_STOCK,
          userId: seller.userId,
          payload,
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Seller notifications — TEMPORARY generic-type mapping.
  // These persist seller events under REGISTRATION_CONFIRMATION (the closest
  // existing generic type) with a `kind` discriminator in the payload.
  // M4b/K1 will add proper SELLER_* NotificationType enum values and clean up
  // these payloads — at that point, replace these methods and drop the `kind`
  // field workaround.
  // ---------------------------------------------------------------------------

  /**
   * Record an admin-review-queue notification when a seller registers.
   * Targets staff (not a specific user), so `userId` is null.
   */
  async recordSellerRegistered(event: SellerRegisteredEvent): Promise<void> {
    await this.prisma.notification.create({
      data: {
        type: NotificationType.REGISTRATION_CONFIRMATION,
        userId: null, // admin review queue (staff-targeted, like recordLowStock)
        payload: {
          kind: SELLER_REGISTERED,
          ...event,
        },
      },
    });
  }

  /**
   * Record a seller-facing KYC outcome notification.
   * `kind` is SELLER_KYC_APPROVED or SELLER_KYC_REJECTED (passed by the listener
   * since both events share the same SellerKycEvent payload shape).
   */
  async recordSellerKyc(
    event: SellerKycEvent,
    kind: typeof SELLER_KYC_APPROVED | typeof SELLER_KYC_REJECTED,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        type: NotificationType.REGISTRATION_CONFIRMATION,
        userId: event.userId, // notify the seller directly
        payload: {
          kind,
          ...event,
        },
      },
    });
  }
}
