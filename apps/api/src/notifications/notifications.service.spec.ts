/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { NotificationType, Role } from '@prisma/client';
import {
  SELLER_REGISTERED,
  SELLER_KYC_APPROVED,
  SELLER_KYC_REJECTED,
} from '../sellers/seller-events';
import { NotificationsService } from './notifications.service';

const makePrisma = () => ({
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  seller: { findUnique: jest.fn() },
});

describe('NotificationsService.recordLowStock', () => {
  it('creates an admin-facing LOW_STOCK notification with the event payload', async () => {
    const prisma = makePrisma();
    const svc = new NotificationsService(prisma as never);
    prisma.seller.findUnique.mockResolvedValue(null);

    await svc.recordLowStock({
      productId: 'p1',
      available: 3,
      threshold: 5,
      sellerId: 'seller-1',
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        type: NotificationType.LOW_STOCK,
        userId: null,
        payload: {
          productId: 'p1',
          available: 3,
          threshold: 5,
          sellerId: 'seller-1',
        },
      },
    });
  });

  it('records BOTH an admin (userId:null) and an owning-seller low-stock notification', async () => {
    const prisma = makePrisma();
    const svc = new NotificationsService(prisma as never);
    // arrange: seller.findUnique resolves { userId: 'owner-user' }
    prisma.seller.findUnique.mockResolvedValue({ userId: 'owner-user' });
    prisma.notification.create.mockResolvedValue({});

    await svc.recordLowStock({
      productId: 'p1',
      available: 1,
      threshold: 5,
      sellerId: 'seller-9',
    });

    expect(prisma.seller.findUnique).toHaveBeenCalledWith({
      where: { id: 'seller-9' },
      select: { userId: true },
    });
    // admin notification (userId: null)
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: null,
          type: NotificationType.LOW_STOCK,
        }),
      }),
    );
    // seller notification (userId: owner)
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'owner-user',
          type: NotificationType.LOW_STOCK,
        }),
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  });

  it('still records the admin alert if the owning seller cannot be resolved', async () => {
    const prisma = makePrisma();
    const svc = new NotificationsService(prisma as never);
    prisma.seller.findUnique.mockResolvedValue(null);
    prisma.notification.create.mockResolvedValue({});

    await svc.recordLowStock({
      productId: 'p1',
      available: 1,
      threshold: 5,
      sellerId: 'gone',
    });

    // admin alert still written; no seller alert
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: null }),
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('still records the admin alert (and does not throw) if the seller lookup fails', async () => {
    const prisma = makePrisma();
    const svc = new NotificationsService(prisma as never);
    prisma.seller.findUnique.mockRejectedValue(new Error('db down'));
    prisma.notification.create.mockResolvedValue({});

    await expect(
      svc.recordLowStock({
        productId: 'p1',
        available: 1,
        threshold: 5,
        sellerId: 's-err',
      }),
    ).resolves.toBeUndefined();

    // admin write happened (once), seller write skipped
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: null }),
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
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

describe('read methods', () => {
  const makeService = () => {
    const prisma = makePrisma();
    const service = new NotificationsService(prisma as never);
    return { prisma, service };
  };

  // list — scoping per role
  it('list scopes a CUSTOMER to their own rows', async () => {
    const { prisma, service } = makeService();
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);
    await service.list({ sub: 'u1', email: 'c@x', role: Role.CUSTOMER }, {});
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('list includes the shared staff queue for ADMIN', async () => {
    const { prisma, service } = makeService();
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);
    await service.list({ sub: 'a1', email: 'a@x', role: Role.ADMIN }, {});
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ userId: 'a1' }, { userId: null }] },
      }),
    );
  });

  it('list adds readAt:null when unread="true"', async () => {
    const { prisma, service } = makeService();
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);
    await service.list(
      { sub: 'u1', email: 'c@x', role: Role.CUSTOMER },
      { unread: 'true' },
    );
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', readAt: null },
      }),
    );
  });

  it('list returns the paginated envelope with totalPages', async () => {
    const { prisma, service } = makeService();
    prisma.notification.findMany.mockResolvedValue([
      {
        id: 'n1',
        type: NotificationType.LOW_STOCK,
        payload: { productId: 'p' },
        readAt: null,
        createdAt: new Date('2026-07-01'),
      },
    ]);
    prisma.notification.count.mockResolvedValue(21);
    const res = await service.list(
      { sub: 'u1', email: 'c@x', role: Role.CUSTOMER },
      { page: 2, pageSize: 20 },
    );
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
    expect(res).toMatchObject({
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
    expect(res.data[0]).toEqual({
      id: 'n1',
      type: NotificationType.LOW_STOCK,
      payload: { productId: 'p' },
      readAt: null,
      createdAt: new Date('2026-07-01'),
    });
  });

  // unreadCount
  it('unreadCount counts unread within visibility (staff includes userId:null)', async () => {
    const { prisma, service } = makeService();
    prisma.notification.count.mockResolvedValue(3);
    const res = await service.unreadCount({
      sub: 'a1',
      email: 'a@x',
      role: Role.ADMIN,
    });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { OR: [{ userId: 'a1' }, { userId: null }], readAt: null },
    });
    expect(res).toEqual({ count: 3 });
  });

  // markRead
  it('markRead updateMany-scopes by id + visibility and returns true when a row matched', async () => {
    const { prisma, service } = makeService();
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    const ok = await service.markRead(
      { sub: 'u1', email: 'c@x', role: Role.CUSTOMER },
      'n1',
    );
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', userId: 'u1' },
      data: { readAt: expect.any(Date) },
    });
    expect(ok).toBe(true);
  });

  it('markRead returns false when no visible row matched (foreign/absent id)', async () => {
    const { prisma, service } = makeService();
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    const ok = await service.markRead(
      { sub: 'u1', email: 'c@x', role: Role.CUSTOMER },
      'nope',
    );
    expect(ok).toBe(false);
  });

  // markAllRead
  it('markAllRead marks all unread within visibility and returns the count', async () => {
    const { prisma, service } = makeService();
    prisma.notification.updateMany.mockResolvedValue({ count: 5 });
    const res = await service.markAllRead({
      sub: 'a1',
      email: 'a@x',
      role: Role.ADMIN,
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: 'a1' }, { userId: null }], readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(res).toEqual({ updated: 5 });
  });
});
