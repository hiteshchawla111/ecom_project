import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  SELLER_REGISTERED,
  SELLER_KYC_APPROVED,
  SELLER_KYC_REJECTED,
} from '../sellers/seller-events';
import type {
  SellerRegisteredEvent,
  SellerKycEvent,
} from '../sellers/seller-events';
import { NotificationsService } from './notifications.service';

/**
 * Listens for seller domain events and persists Notification rows.
 * Decouples notification writes from the sellers request handlers
 * (CLAUDE.md: notifications fire on domain events, not inline).
 *
 * NOTE — generic-type mapping: seller events are stored under
 * NotificationType.REGISTRATION_CONFIRMATION with a `payload.kind`
 * discriminator. M4b/K1 will add SELLER_* NotificationType values and
 * remove this workaround.
 */
@Injectable()
export class SellerNotificationListener {
  private readonly logger = new Logger(SellerNotificationListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(SELLER_REGISTERED)
  async onRegistered(event: SellerRegisteredEvent): Promise<void> {
    try {
      await this.notifications.recordSellerRegistered(event);
    } catch (err) {
      this.logger.error(
        `Failed to record seller.registered notification for ${event.sellerId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @OnEvent(SELLER_KYC_APPROVED)
  async onApproved(event: SellerKycEvent): Promise<void> {
    try {
      await this.notifications.recordSellerKyc(event, SELLER_KYC_APPROVED);
    } catch (err) {
      this.logger.error(
        `Failed to record seller.kyc.approved notification for ${event.sellerId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @OnEvent(SELLER_KYC_REJECTED)
  async onRejected(event: SellerKycEvent): Promise<void> {
    try {
      await this.notifications.recordSellerKyc(event, SELLER_KYC_REJECTED);
    } catch (err) {
      this.logger.error(
        `Failed to record seller.kyc.rejected notification for ${event.sellerId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
