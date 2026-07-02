/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReviewsService } from './reviews.service';
import { REVIEW_PUBLISHED_EVENT } from './reviews.events';

const prismaUniqueError = () =>
  new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'x',
  });

// $transaction(cb) executes the callback with a tx client that proxies to the
// same mock methods, so assertions can target tx.review.create etc.
const makePrisma = () => {
  const prisma: any = {
    review: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn(
    async (arg: ((tx: any) => Promise<unknown>) | Promise<unknown>[]) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(prisma),
  );
  return prisma;
};

const makeOrders = () => ({
  hasDeliveredProduct: jest.fn(),
});

const makeProducts = () => ({
  recomputeRating: jest.fn().mockResolvedValue(undefined),
});

const makeEmitter = () => ({
  emit: jest.fn(),
});

const makeAudit = () => ({
  record: jest.fn().mockResolvedValue(undefined),
});

const build = () => {
  const prisma = makePrisma();
  const orders = makeOrders();
  const products = makeProducts();
  const emitter = makeEmitter();
  const audit = makeAudit();
  const service = new ReviewsService(
    prisma as never,
    orders as never,
    products as never,
    emitter as never,
    audit as never,
  );
  return { service, prisma, tx: prisma, orders, products, emitter, audit };
};

describe('ReviewsService', () => {
  describe('create', () => {
    it('rejects with 403 when the user has no delivered order for the product', async () => {
      const { service, orders } = build();
      orders.hasDeliveredProduct.mockResolvedValue(false);
      await expect(
        service.create('p1', 'u1', { rating: 5 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects with 409 when the user already reviewed the product', async () => {
      const { service, tx, orders } = build();
      orders.hasDeliveredProduct.mockResolvedValue(true);
      tx.review.create.mockRejectedValue(prismaUniqueError());
      await expect(
        service.create('p1', 'u1', { rating: 5 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a verified published review, recomputes the aggregate, emits post-commit', async () => {
      const { service, tx, orders, products, emitter } = build();
      orders.hasDeliveredProduct.mockResolvedValue(true);
      tx.review.create.mockResolvedValue({
        id: 'r1',
        rating: 5,
        title: null,
        body: null,
        isVerified: true,
        publishedAt: new Date('2026-07-01T00:00:00Z'),
        author: { name: 'Ann Lee' },
      });
      const view = await service.create('p1', 'u1', { rating: 5 });
      expect(tx.review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productId: 'p1',
            userId: 'u1',
            rating: 5,
            isVerified: true,
            publishedAt: expect.any(Date),
          }),
        }),
      );
      expect(products.recomputeRating).toHaveBeenCalledWith('p1', tx);
      expect(emitter.emit).toHaveBeenCalledWith(REVIEW_PUBLISHED_EVENT, {
        reviewId: 'r1',
        productId: 'p1',
        rating: 5,
      });
      expect(view).toMatchObject({
        id: 'r1',
        authorName: 'Ann Lee',
        isVerified: true,
      });
      expect(JSON.stringify(view)).not.toContain('@'); // no PII (email) leak
    });

    it('does not emit when the transaction throws (never on a rolled-back write)', async () => {
      const { service, tx, orders, emitter } = build();
      orders.hasDeliveredProduct.mockResolvedValue(true);
      tx.review.create.mockRejectedValue(prismaUniqueError());
      await expect(
        service.create('p1', 'u1', { rating: 5 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('listPublic', () => {
    const aggregateOk = { _avg: { rating: 4.5 }, _count: { _all: 2 } };
    const groupByOk = [
      { rating: 4, _count: { _all: 1 } },
      { rating: 5, _count: { _all: 1 } },
    ];

    it('filters to visible reviews (publishedAt set, deletedAt null) and returns a summary', async () => {
      const { service, prisma } = build();
      prisma.review.findMany.mockResolvedValue([
        {
          id: 'r1',
          rating: 5,
          title: null,
          body: null,
          isVerified: true,
          publishedAt: new Date('2026-07-01T00:00:00Z'),
          author: { name: 'Ann' },
        },
      ]);
      prisma.review.aggregate.mockResolvedValue(aggregateOk);
      prisma.review.groupBy.mockResolvedValue(groupByOk);

      const res = await service.listPublic('p1', {});

      const findManyArgs = prisma.review.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toMatchObject({
        productId: 'p1',
        publishedAt: { not: null },
        deletedAt: null,
      });
      expect(findManyArgs.orderBy).toEqual([
        { publishedAt: 'desc' },
        { id: 'desc' },
      ]);
      expect(res.nextCursor).toBeNull();
      expect(res.data).toHaveLength(1);
      expect(res.data[0]).toMatchObject({ id: 'r1', authorName: 'Ann' });
      expect(res.summary).toEqual({
        ratingAvg: '4.50',
        ratingCount: 2,
        distribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 },
      });
    });

    it('sets nextCursor when an extra (limit+1) row exists and slices it off', async () => {
      const { service, prisma } = build();
      const rows = Array.from({ length: 3 }, (_, i) => ({
        id: `r${i}`,
        rating: 5,
        title: null,
        body: null,
        isVerified: true,
        publishedAt: new Date(`2026-07-0${i + 1}T00:00:00Z`),
        author: { name: 'Ann' },
      }));
      prisma.review.findMany.mockResolvedValue(rows);
      prisma.review.aggregate.mockResolvedValue(aggregateOk);
      prisma.review.groupBy.mockResolvedValue(groupByOk);

      const res = await service.listPublic('p1', { limit: 2 });

      expect(prisma.review.findMany.mock.calls[0][0].take).toBe(3); // limit + 1
      expect(res.data).toHaveLength(2);
      const last = rows[1];
      expect(res.nextCursor).toBe(
        `${last.publishedAt.toISOString()}_${last.id}`,
      );
    });

    it('returns null ratingAvg with a zeroed distribution when there are no reviews', async () => {
      const { service, prisma } = build();
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.aggregate.mockResolvedValue({
        _avg: { rating: null },
        _count: { _all: 0 },
      });
      prisma.review.groupBy.mockResolvedValue([]);

      const res = await service.listPublic('p1', {});

      expect(res.data).toEqual([]);
      expect(res.nextCursor).toBeNull();
      expect(res.summary).toEqual({
        ratingAvg: null,
        ratingCount: 0,
        distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      });
    });

    it('applies a keyset cursor filter when a cursor is provided', async () => {
      const { service, prisma } = build();
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.aggregate.mockResolvedValue({
        _avg: { rating: null },
        _count: { _all: 0 },
      });
      prisma.review.groupBy.mockResolvedValue([]);

      await service.listPublic('p1', {
        cursor: '2026-07-01T00:00:00.000Z_r5',
      });

      const where = prisma.review.findMany.mock.calls[0][0].where;
      expect(where.AND).toBeDefined();
      expect(where.AND[1].OR).toEqual([
        { publishedAt: { lt: new Date('2026-07-01T00:00:00.000Z') } },
        { publishedAt: new Date('2026-07-01T00:00:00.000Z'), id: { lt: 'r5' } },
      ]);
    });
  });

  describe('hide', () => {
    it('soft-hides, recomputes the aggregate, and audits within one transaction', async () => {
      const { service, tx, products, audit } = build();
      tx.review.findUnique.mockResolvedValue({
        id: 'r1',
        productId: 'p1',
        deletedAt: null,
      });
      tx.review.update.mockResolvedValue({});
      await service.hide('r1', 'admin1');
      expect(tx.review.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { publishedAt: null, deletedAt: expect.any(Date) },
      });
      expect(products.recomputeRating).toHaveBeenCalledWith('p1', tx);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'review.hidden',
          entityType: 'Review',
          entityId: 'r1',
          actorId: 'admin1',
        }),
        tx,
      );
    });

    it('throws 404 when hiding an unknown review', async () => {
      const { service, tx } = build();
      tx.review.findUnique.mockResolvedValue(null);
      await expect(service.hide('missing', 'admin1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('is a no-op success when the review is already hidden', async () => {
      const { service, tx, products, audit } = build();
      tx.review.findUnique.mockResolvedValue({
        id: 'r1',
        productId: 'p1',
        deletedAt: new Date(),
      });
      await service.hide('r1', 'admin1');
      expect(tx.review.update).not.toHaveBeenCalled();
      expect(products.recomputeRating).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('unhide', () => {
    it('re-publishes, recomputes the aggregate, and audits within one transaction', async () => {
      const { service, tx, products, audit } = build();
      tx.review.findUnique.mockResolvedValue({
        id: 'r1',
        productId: 'p1',
        deletedAt: new Date(),
      });
      tx.review.update.mockResolvedValue({});
      await service.unhide('r1', 'admin1');
      expect(tx.review.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { publishedAt: expect.any(Date), deletedAt: null },
      });
      expect(products.recomputeRating).toHaveBeenCalledWith('p1', tx);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'review.unhidden',
          entityType: 'Review',
          entityId: 'r1',
          actorId: 'admin1',
        }),
        tx,
      );
    });

    it('throws 404 when unhiding an unknown review', async () => {
      const { service, tx } = build();
      tx.review.findUnique.mockResolvedValue(null);
      await expect(service.unhide('missing', 'admin1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('is a no-op success when the review is already visible', async () => {
      const { service, tx, products, audit } = build();
      tx.review.findUnique.mockResolvedValue({
        id: 'r1',
        productId: 'p1',
        deletedAt: null,
      });
      await service.unhide('r1', 'admin1');
      expect(tx.review.update).not.toHaveBeenCalled();
      expect(products.recomputeRating).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('adminList', () => {
    const makeRow = (deletedAt: Date | null) => ({
      id: 'r1',
      productId: 'p1',
      userId: 'u1',
      rating: 5,
      title: null,
      body: null,
      isVerified: true,
      publishedAt: deletedAt ? null : new Date('2026-07-01T00:00:00Z'),
      deletedAt,
      createdAt: new Date('2026-07-01T00:00:00Z'),
      author: { name: 'Ann' },
    });

    it('filters to hidden reviews when isHidden="true" and returns the paginated shape', async () => {
      const { service, prisma } = build();
      prisma.review.findMany.mockResolvedValue([makeRow(new Date())]);
      prisma.review.count.mockResolvedValue(1);

      const res = await service.adminList({ isHidden: 'true' });

      const findManyArgs = prisma.review.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual({ deletedAt: { not: null } });
      expect(findManyArgs.orderBy).toEqual({ createdAt: 'desc' });
      expect(res).toMatchObject({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
      expect(res.data).toHaveLength(1);
      expect(res.data[0]).toMatchObject({
        id: 'r1',
        productId: 'p1',
        userId: 'u1',
        isHidden: true,
        authorName: 'Ann',
      });
    });

    it('filters to visible reviews when isHidden="false"', async () => {
      const { service, prisma } = build();
      prisma.review.findMany.mockResolvedValue([makeRow(null)]);
      prisma.review.count.mockResolvedValue(1);

      const res = await service.adminList({ isHidden: 'false' });

      expect(prisma.review.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
      });
      expect(res.data[0].isHidden).toBe(false);
    });

    it('applies productId filter and pagination math', async () => {
      const { service, prisma } = build();
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.count.mockResolvedValue(0);

      const res = await service.adminList({
        productId: 'p1',
        page: 2,
        pageSize: 5,
      });

      const findManyArgs = prisma.review.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual({ productId: 'p1' });
      expect(findManyArgs.skip).toBe(5);
      expect(findManyArgs.take).toBe(5);
      expect(res).toMatchObject({
        page: 2,
        pageSize: 5,
        total: 0,
        data: [],
        totalPages: 1,
      });
    });

    it('computes totalPages as ceil(total / pageSize)', async () => {
      const { service, prisma } = build();
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.count.mockResolvedValue(12);

      const res = await service.adminList({ pageSize: 5 });

      expect(res.totalPages).toBe(3);
    });
  });

  describe('decodeCursor (via listPublic)', () => {
    it('treats a garbage cursor as no cursor instead of throwing', async () => {
      const { service, prisma } = build();
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.aggregate.mockResolvedValue({
        _avg: { rating: null },
        _count: { _all: 0 },
      });
      prisma.review.groupBy.mockResolvedValue([]);

      await expect(
        service.listPublic('p1', { cursor: 'garbage_x', limit: 10 }),
      ).resolves.toBeDefined();

      const where = prisma.review.findMany.mock.calls[0][0].where;
      expect(where.AND).toBeUndefined();
      expect(where).toMatchObject({
        productId: 'p1',
        publishedAt: { not: null },
        deletedAt: null,
      });
    });
  });
});
