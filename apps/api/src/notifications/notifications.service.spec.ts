import { NotificationType } from '@prisma/client';
import {
  SELLER_REGISTERED,
  SELLER_KYC_APPROVED,
  SELLER_KYC_REJECTED,
} from '../sellers/seller-events';
import { NotificationsService } from './notifications.service';

const makePrisma = () => ({
  notification: { create: jest.fn() },
});

describe('NotificationsService.recordLowStock', () => {
  it('creates an admin-facing LOW_STOCK notification with the event payload', async () => {
    const prisma = makePrisma();
    const svc = new NotificationsService(prisma as never);

    await svc.recordLowStock({
      productId: 'p1',
      available: 3,
      threshold: 5,
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        type: NotificationType.LOW_STOCK,
        userId: null,
        payload: { productId: 'p1', available: 3, threshold: 5 },
      },
    });
  });
});

describe('NotificationsService.recordSellerRegistered', () => {
  it('creates a staff-targeted REGISTRATION_CONFIRMATION notification with kind=seller.registered', async () => {
    const prisma = makePrisma();
    const svc = new NotificationsService(prisma as never);

    const event = { sellerId: 's1', userId: 'u1', displayName: 'Acme Store' };
    await svc.recordSellerRegistered(event);

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        type: NotificationType.REGISTRATION_CONFIRMATION,
        userId: null,
        payload: {
          kind: SELLER_REGISTERED,
          sellerId: 's1',
          userId: 'u1',
          displayName: 'Acme Store',
        },
      },
    });
  });
});

describe('NotificationsService.recordSellerKyc', () => {
  it('creates a seller-facing REGISTRATION_CONFIRMATION notification for approved KYC', async () => {
    const prisma = makePrisma();
    const svc = new NotificationsService(prisma as never);

    const event = { sellerId: 's1', userId: 'u1', status: 'ACTIVE' as const };
    await svc.recordSellerKyc(event, SELLER_KYC_APPROVED);

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        type: NotificationType.REGISTRATION_CONFIRMATION,
        userId: 'u1',
        payload: {
          kind: SELLER_KYC_APPROVED,
          sellerId: 's1',
          userId: 'u1',
          status: 'ACTIVE',
        },
      },
    });
  });

  it('creates a seller-facing REGISTRATION_CONFIRMATION notification for rejected KYC', async () => {
    const prisma = makePrisma();
    const svc = new NotificationsService(prisma as never);

    const event = {
      sellerId: 's1',
      userId: 'u1',
      status: 'SUSPENDED' as const,
      reason: 'Documents invalid',
    };
    await svc.recordSellerKyc(event, SELLER_KYC_REJECTED);

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        type: NotificationType.REGISTRATION_CONFIRMATION,
        userId: 'u1',
        payload: {
          kind: SELLER_KYC_REJECTED,
          sellerId: 's1',
          userId: 'u1',
          status: 'SUSPENDED',
          reason: 'Documents invalid',
        },
      },
    });
  });
});
