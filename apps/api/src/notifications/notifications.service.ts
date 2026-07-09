import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationType, OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LowStockEvent } from '../inventory/inventory.events';
import {
  SELLER_KYC_APPROVED,
  SELLER_KYC_REJECTED,
  SellerRegisteredEvent,
  SellerKycEvent,
} from '../sellers/seller-events';
import { ReviewPublishedEvent } from '../reviews/reviews.events';
import type { AccessTokenPayload } from '../auth/auth-tokens';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NOTIFICATION_CHANNEL } from './notification-channel';
import type {
  NotificationChannel,
  NotificationMessage,
} from './notification-channel';

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}

/** Own rows always; the shared staff queue (userId:null) only for staff.
 *  Reused by every read/mark op so scoping can never diverge. */
function visibilityWhere(
  user: AccessTokenPayload,
): Prisma.NotificationWhereInput {
  const isStaff =
    user.role === Role.ADMIN || user.role === Role.INVENTORY_MANAGER;
  return isStaff
    ? { OR: [{ userId: user.sub }, { userId: null }] }
    : { userId: user.sub };
}

/**
 * Persists domain-event notifications. This is the sink for events emitted
 * elsewhere (e.g. inventory low-stock); delivery/consumption UX is Phase 6.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
  ) {}

  /** Best-effort out-of-band delivery of a persisted notification. Never throws:
   *  the persisted row is source of truth, so a channel outage must not fail the
   *  domain write or the originating request. */
  private async dispatch(message: NotificationMessage): Promise<void> {
    try {
      await this.channel.send(message);
    } catch (err) {
      this.logger.error(
        `Notification channel send failed for ${message.type}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

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
    const adminMessage: NotificationMessage = {
      type: NotificationType.LOW_STOCK,
      userId: null,
      payload,
    };
    await this.prisma.notification.create({
      data: adminMessage as Prisma.NotificationUncheckedCreateInput,
    });
    await this.dispatch(adminMessage);

    // Owning-seller alert: resolve the seller's user. If the seller is gone
    // or the lookup/write fails, the admin alert above still stands — log and
    // swallow rather than fail the whole handler.
    try {
      const seller = await this.prisma.seller.findUnique({
        where: { id: event.sellerId },
        select: { userId: true },
      });
      if (seller) {
        const sellerMessage: NotificationMessage = {
          type: NotificationType.LOW_STOCK,
          userId: seller.userId,
          payload,
        };
        await this.prisma.notification.create({
          data: sellerMessage as Prisma.NotificationUncheckedCreateInput,
        });
        await this.dispatch(sellerMessage);
      }
    } catch (err) {
      this.logger.error(
        `Failed to write owning-seller low-stock notification for seller ${event.sellerId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Record an admin-queue notification when a review is published.
   * Targets staff (not a specific user), so `userId` is null — matching the
   * low-stock admin-target convention.
   */
  async recordNewReview(event: ReviewPublishedEvent): Promise<void> {
    const message: NotificationMessage = {
      type: NotificationType.NEW_REVIEW,
      userId: null,
      payload: {
        reviewId: event.reviewId,
        productId: event.productId,
        rating: event.rating,
      },
    };
    await this.prisma.notification.create({
      data: message as Prisma.NotificationUncheckedCreateInput,
    });
    await this.dispatch(message);
  }

  // ---------------------------------------------------------------------------
  // Seller notifications — first-class SELLER_* NotificationType values.
  // ---------------------------------------------------------------------------

  /**
   * Record an admin-review-queue notification when a seller registers.
   * Targets staff (not a specific user), so `userId` is null.
   */
  async recordSellerRegistered(event: SellerRegisteredEvent): Promise<void> {
    const message: NotificationMessage = {
      type: NotificationType.SELLER_REGISTERED,
      userId: null, // admin review queue (staff-targeted, like recordLowStock)
      payload: {
        sellerId: event.sellerId,
        userId: event.userId,
        displayName: event.displayName,
      },
    };
    await this.prisma.notification.create({
      data: message as Prisma.NotificationUncheckedCreateInput,
    });
    await this.dispatch(message);
  }

  /**
   * Record a seller-facing KYC outcome notification.
   * `kind` is SELLER_KYC_APPROVED or SELLER_KYC_REJECTED (passed by the listener
   * since both events share the same SellerKycEvent payload shape); it selects
   * the NotificationType but is no longer stored in the payload.
   */
  async recordSellerKyc(
    event: SellerKycEvent,
    kind: typeof SELLER_KYC_APPROVED | typeof SELLER_KYC_REJECTED,
  ): Promise<void> {
    const type =
      kind === SELLER_KYC_APPROVED
        ? NotificationType.SELLER_KYC_APPROVED
        : NotificationType.SELLER_KYC_REJECTED;
    const message: NotificationMessage = {
      type,
      userId: event.userId, // notify the seller directly
      payload: {
        sellerId: event.sellerId,
        userId: event.userId,
        status: event.status,
        ...(event.reason ? { reason: event.reason } : {}),
      },
    };
    await this.prisma.notification.create({
      data: message as Prisma.NotificationUncheckedCreateInput,
    });
    await this.dispatch(message);
  }

  // ---------------------------------------------------------------------------
  // Registration / order notifications.
  // ---------------------------------------------------------------------------

  /** Record a registration-confirmation notification for the new user. */
  async recordRegistration(event: { userId: string }): Promise<void> {
    const message: NotificationMessage = {
      type: NotificationType.REGISTRATION_CONFIRMATION,
      userId: event.userId,
      payload: { userId: event.userId },
    };
    await this.prisma.notification.create({
      data: message as Prisma.NotificationUncheckedCreateInput,
    });
    await this.dispatch(message);
  }

  /**
   * Record notifications for a newly placed order: a staff-queue NEW_ORDER
   * alert (userId: null) plus the customer's own ORDER_CONFIRMATION.
   */
  async recordOrderPlaced(event: {
    orderId: string;
    userId: string;
  }): Promise<void> {
    // Staff queue (new order to fulfil) + the customer's confirmation.
    const newOrderMessage: NotificationMessage = {
      type: NotificationType.NEW_ORDER,
      userId: null,
      payload: { orderId: event.orderId, userId: event.userId },
    };
    await this.prisma.notification.create({
      data: newOrderMessage as Prisma.NotificationUncheckedCreateInput,
    });
    await this.dispatch(newOrderMessage);

    const confirmationMessage: NotificationMessage = {
      type: NotificationType.ORDER_CONFIRMATION,
      userId: event.userId,
      payload: { orderId: event.orderId },
    };
    await this.prisma.notification.create({
      data: confirmationMessage as Prisma.NotificationUncheckedCreateInput,
    });
    await this.dispatch(confirmationMessage);
  }

  /**
   * Record a customer-facing status-change notification. Only SHIPPED and
   * DELIVERED produce a notification in S2; any other status is a no-op.
   */
  async recordOrderStatus(event: {
    orderId: string;
    userId: string;
    status: OrderStatus;
  }): Promise<void> {
    const type =
      event.status === OrderStatus.SHIPPED
        ? NotificationType.SHIPPING_UPDATE
        : event.status === OrderStatus.DELIVERED
          ? NotificationType.DELIVERY_UPDATE
          : null;
    if (!type) return; // S2 notifies only on Shipped/Delivered.
    const message: NotificationMessage = {
      type,
      userId: event.userId,
      payload: { orderId: event.orderId, status: event.status },
    };
    await this.prisma.notification.create({
      data: message as Prisma.NotificationUncheckedCreateInput,
    });
    await this.dispatch(message);
  }

  // ---------------------------------------------------------------------------
  // Consumption (read) API — visibility-scoped via visibilityWhere() so every
  // method (list/count/mark) shares one definition of "what can this caller see".
  // ---------------------------------------------------------------------------

  async list(
    user: AccessTokenPayload,
    dto: ListNotificationsDto,
  ): Promise<Paginated<NotificationView>> {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.NotificationWhereInput = { ...visibilityWhere(user) };
    if (dto.unread === 'true') where.readAt = null;

    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          type: true,
          payload: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        payload: r.payload,
        readAt: r.readAt,
        createdAt: r.createdAt,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async unreadCount(user: AccessTokenPayload): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { ...visibilityWhere(user), readAt: null },
    });
    return { count };
  }

  async markRead(user: AccessTokenPayload, id: string): Promise<boolean> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, ...visibilityWhere(user) },
      data: { readAt: new Date() },
    });
    return count > 0;
  }

  async markAllRead(user: AccessTokenPayload): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { ...visibilityWhere(user), readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
