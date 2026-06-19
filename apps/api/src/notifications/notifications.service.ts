import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LowStockEvent } from '../inventory/inventory.events';

/**
 * Persists domain-event notifications. This is the sink for events emitted
 * elsewhere (e.g. inventory low-stock); delivery/consumption UX is Phase 6.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an admin-facing low-stock alert. `userId` is null because it targets
   * staff (admin / inventory manager), not a specific customer.
   */
  async recordLowStock(event: LowStockEvent): Promise<void> {
    await this.prisma.notification.create({
      data: {
        type: NotificationType.LOW_STOCK,
        userId: null,
        // LowStockEvent is structurally valid JSON; the double cast is the
        // canonical bridge to Prisma's InputJsonValue (its JSON typing can't
        // infer a plain interface as assignable).
        payload: event as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
