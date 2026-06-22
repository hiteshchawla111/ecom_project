import { Logger } from '@nestjs/common';
import {
  SELLER_KYC_APPROVED,
  SELLER_KYC_REJECTED,
} from '../sellers/seller-events';
import { SellerNotificationListener } from './seller.listener';

const mockRegisteredEvent = {
  sellerId: 's1',
  userId: 'u1',
  displayName: 'Acme Store',
};

const mockKycEvent = {
  sellerId: 's1',
  userId: 'u1',
  status: 'ACTIVE' as const,
  reason: undefined,
};

describe('SellerNotificationListener', () => {
  describe('onRegistered', () => {
    it('calls recordSellerRegistered with the event', async () => {
      const service = {
        recordSellerRegistered: jest.fn().mockResolvedValue(undefined),
        recordSellerKyc: jest.fn(),
      };
      const listener = new SellerNotificationListener(service as never);

      await listener.onRegistered(mockRegisteredEvent);

      expect(service.recordSellerRegistered).toHaveBeenCalledWith(
        mockRegisteredEvent,
      );
    });

    it('swallows a persistence failure so the emitter stays healthy', async () => {
      const service = {
        recordSellerRegistered: jest
          .fn()
          .mockRejectedValue(new Error('db down')),
        recordSellerKyc: jest.fn(),
      };
      const listener = new SellerNotificationListener(service as never);
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(
        listener.onRegistered(mockRegisteredEvent),
      ).resolves.toBeUndefined();
    });
  });

  describe('onApproved', () => {
    it('calls recordSellerKyc with the event and SELLER_KYC_APPROVED kind', async () => {
      const service = {
        recordSellerRegistered: jest.fn(),
        recordSellerKyc: jest.fn().mockResolvedValue(undefined),
      };
      const listener = new SellerNotificationListener(service as never);

      await listener.onApproved(mockKycEvent);

      expect(service.recordSellerKyc).toHaveBeenCalledWith(
        mockKycEvent,
        SELLER_KYC_APPROVED,
      );
    });

    it('swallows a persistence failure so the emitter stays healthy', async () => {
      const service = {
        recordSellerRegistered: jest.fn(),
        recordSellerKyc: jest.fn().mockRejectedValue(new Error('db down')),
      };
      const listener = new SellerNotificationListener(service as never);
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(listener.onApproved(mockKycEvent)).resolves.toBeUndefined();
    });
  });

  describe('onRejected', () => {
    it('calls recordSellerKyc with the event and SELLER_KYC_REJECTED kind', async () => {
      const service = {
        recordSellerRegistered: jest.fn(),
        recordSellerKyc: jest.fn().mockResolvedValue(undefined),
      };
      const listener = new SellerNotificationListener(service as never);

      await listener.onRejected(mockKycEvent);

      expect(service.recordSellerKyc).toHaveBeenCalledWith(
        mockKycEvent,
        SELLER_KYC_REJECTED,
      );
    });

    it('swallows a persistence failure so the emitter stays healthy', async () => {
      const service = {
        recordSellerRegistered: jest.fn(),
        recordSellerKyc: jest.fn().mockRejectedValue(new Error('db down')),
      };
      const listener = new SellerNotificationListener(service as never);
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(listener.onRejected(mockKycEvent)).resolves.toBeUndefined();
    });
  });
});
