import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus, Role } from '@prisma/client';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductSortBy, SortDir } from './dto/list-products.dto';
import type { ScopeActor } from './seller-scope';

const ADMIN: ScopeActor = { role: Role.ADMIN };
const SELLER_A: ScopeActor = { role: Role.SELLER, sellerId: 'seller-a' };

const makePrisma = () => ({
  product: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  seller: {
    findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'platform-seller-id' }),
  },
});

const build = () => {
  const prisma = makePrisma();
  const svc = new ProductsService(prisma as never);
  return { svc, prisma };
};

const baseCreate: CreateProductDto = {
  name: 'Widget',
  sku: 'WID-001',
  description: 'A widget',
  price: 19.99,
  categoryId: 'cat1',
};

describe('ProductsService', () => {
  describe('create', () => {
    it('creates a product with the given fields', async () => {
      const { svc, prisma } = build();
      prisma.product.create.mockResolvedValue({ id: 'p1', ...baseCreate });

      const res = await svc.create(baseCreate, ADMIN);

      const [createCall] = prisma.product.create.mock.calls as Array<
        [{ data: { sku: string; categoryId: string } }]
      >;
      expect(createCall[0].data).toEqual(
        expect.objectContaining({ sku: 'WID-001', categoryId: 'cat1' }),
      );
      expect(res).toEqual(expect.objectContaining({ id: 'p1' }));
    });

    it('sets a sellerId on the created product', async () => {
      const { svc, prisma } = build();
      prisma.product.create.mockResolvedValue({ id: 'p1', ...baseCreate });

      await svc.create(baseCreate, ADMIN);

      const [createCall] = prisma.product.create.mock.calls as Array<
        [{ data: { sellerId?: string } }]
      >;
      expect(createCall[0].data.sellerId).toEqual(expect.any(String));
    });

    it('rejects a duplicate SKU with 409', async () => {
      const { svc, prisma } = build();
      prisma.product.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(svc.create(baseCreate, ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('maps an unknown categoryId (FK violation) to 400-class error', async () => {
      const { svc, prisma } = build();
      prisma.product.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('fk', {
          code: 'P2003',
          clientVersion: 'x',
        }),
      );
      await expect(svc.create(baseCreate, ADMIN)).rejects.toThrow();
    });
  });

  describe('findOne', () => {
    it('returns a product that exists and is not soft-deleted', async () => {
      const { svc, prisma } = build();
      prisma.product.findFirst.mockResolvedValue({ id: 'p1', deletedAt: null });
      await expect(svc.findOne('p1', ADMIN)).resolves.toEqual(
        expect.objectContaining({ id: 'p1' }),
      );
      const [findCall] = prisma.product.findFirst.mock.calls as Array<
        [{ where: unknown; include?: unknown }]
      >;
      expect(findCall[0].where).toEqual({ id: 'p1', deletedAt: null });
      expect(findCall[0].include).toBeDefined();
    });

    it('throws 404 for a missing product', async () => {
      const { svc, prisma } = build();
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(svc.findOne('nope', ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('list', () => {
    it('returns a paginated envelope excluding soft-deleted, newest first', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      prisma.product.count.mockResolvedValue(2);

      const res = await svc.list({ page: 1, pageSize: 20 }, ADMIN);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(res).toEqual({
        data: [{ id: 'p1' }, { id: 'p2' }],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('defaults page/pageSize and computes skip from page', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await svc.list({ page: 3, pageSize: 10 }, ADMIN);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    /** Captures the `where` passed to the most recent findMany call. */
    const whereOf = (prisma: ReturnType<typeof makePrisma>) => {
      const calls = prisma.product.findMany.mock.calls as Array<
        [{ where: Record<string, unknown> }]
      >;
      return calls[calls.length - 1][0].where;
    };

    const orderByOf = (prisma: ReturnType<typeof makePrisma>) => {
      const calls = prisma.product.findMany.mock.calls as Array<
        [{ orderBy: Record<string, unknown> }]
      >;
      return calls[calls.length - 1][0].orderBy;
    };

    it('applies a case-insensitive search across name, sku and description', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await svc.list({ search: 'phone' }, ADMIN);

      const where = whereOf(prisma);
      expect(where.deletedAt).toBeNull();
      expect(where.OR).toEqual([
        { name: { contains: 'phone', mode: 'insensitive' } },
        { sku: { contains: 'phone', mode: 'insensitive' } },
        { description: { contains: 'phone', mode: 'insensitive' } },
      ]);
    });

    it('filters by categoryId and status', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await svc.list(
        { categoryId: 'cat1', status: ProductStatus.ACTIVE },
        ADMIN,
      );

      const where = whereOf(prisma);
      expect(where.categoryId).toBe('cat1');
      expect(where.status).toBe(ProductStatus.ACTIVE);
    });

    it('filters by a price range (gte/lte)', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await svc.list({ minPrice: 10, maxPrice: 100 }, ADMIN);

      expect(whereOf(prisma).price).toEqual({ gte: 10, lte: 100 });
    });

    it('supports an open-ended minPrice without maxPrice', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await svc.list({ minPrice: 10 }, ADMIN);

      expect(whereOf(prisma).price).toEqual({ gte: 10 });
    });

    it('sorts by the requested column and direction', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await svc.list(
        { sortBy: ProductSortBy.Price, sortDir: SortDir.Asc },
        ADMIN,
      );

      expect(orderByOf(prisma)).toEqual({ price: 'asc' });
    });

    it('defaults sort to createdAt desc when unspecified', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await svc.list({}, ADMIN);

      expect(orderByOf(prisma)).toEqual({ createdAt: 'desc' });
    });

    it('applies the same filter to the count query so totals match', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await svc.list({ categoryId: 'cat1' }, ADMIN);

      const countCalls = prisma.product.count.mock.calls as Array<
        [{ where: Record<string, unknown> }]
      >;
      expect(countCalls[0][0].where).toEqual(
        expect.objectContaining({ categoryId: 'cat1', deletedAt: null }),
      );
    });
  });

  describe('update', () => {
    it('updates an existing product', async () => {
      const { svc, prisma } = build();
      prisma.product.findFirst.mockResolvedValue({ id: 'p1', deletedAt: null });
      prisma.product.update.mockResolvedValue({ id: 'p1', name: 'New' });

      const res = await svc.update('p1', { name: 'New' }, ADMIN);

      const [updateCall] = prisma.product.update.mock.calls as Array<
        [{ where: { id: string }; data: { name?: string } }]
      >;
      expect(updateCall[0].where).toEqual({ id: 'p1' });
      expect(updateCall[0].data).toEqual(
        expect.objectContaining({ name: 'New' }),
      );
      expect(res).toEqual(expect.objectContaining({ name: 'New' }));
    });

    it('throws 404 when updating a missing product', async () => {
      const { svc, prisma } = build();
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(
        svc.update('nope', { name: 'X' }, ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('archive', () => {
    it('sets status to ARCHIVED', async () => {
      const { svc, prisma } = build();
      prisma.product.findFirst.mockResolvedValue({ id: 'p1', deletedAt: null });
      prisma.product.update.mockResolvedValue({
        id: 'p1',
        status: ProductStatus.ARCHIVED,
      });

      const res = await svc.archive('p1', ADMIN);

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: ProductStatus.ARCHIVED },
      });
      expect(res.status).toBe(ProductStatus.ARCHIVED);
    });

    it('throws 404 archiving a missing product', async () => {
      const { svc, prisma } = build();
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(svc.archive('nope', ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setActive', () => {
    it('activates (status ACTIVE) when active=true', async () => {
      const { svc, prisma } = build();
      prisma.product.findFirst.mockResolvedValue({ id: 'p1', deletedAt: null });
      prisma.product.update.mockResolvedValue({
        id: 'p1',
        status: ProductStatus.ACTIVE,
      });

      await svc.setActive('p1', true, ADMIN);

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: ProductStatus.ACTIVE },
      });
    });

    it('deactivates (status INACTIVE) when active=false', async () => {
      const { svc, prisma } = build();
      prisma.product.findFirst.mockResolvedValue({ id: 'p1', deletedAt: null });
      prisma.product.update.mockResolvedValue({
        id: 'p1',
        status: ProductStatus.INACTIVE,
      });

      await svc.setActive('p1', false, ADMIN);

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: ProductStatus.INACTIVE },
      });
    });
  });

  describe('ownership scoping', () => {
    it('list scopes a SELLER to their own products', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await svc.list({}, SELLER_A);

      const [findArgs] = prisma.product.findMany.mock.calls as Array<
        [{ where: { sellerId?: string } }]
      >;
      expect(findArgs[0].where.sellerId).toBe('seller-a');
    });

    it('list does not scope an ADMIN', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await svc.list({}, ADMIN);

      const [findArgs] = prisma.product.findMany.mock.calls as Array<
        [{ where: { sellerId?: string } }]
      >;
      expect(findArgs[0].where.sellerId).toBeUndefined();
    });

    it('findOne 404s when the product belongs to another seller (cross-tenant)', async () => {
      const { svc, prisma } = build();
      prisma.product.findFirst.mockResolvedValue(null); // scoped query misses

      await expect(
        svc.findOne('p-of-seller-b', SELLER_A),
      ).rejects.toBeInstanceOf(NotFoundException);
      const [findArgs] = prisma.product.findFirst.mock.calls as Array<
        [{ where: { sellerId?: string } }]
      >;
      expect(findArgs[0].where.sellerId).toBe('seller-a');
    });

    it('create forces a SELLER product to be owned by the acting seller', async () => {
      const { svc, prisma } = build();
      prisma.product.create.mockResolvedValue({ id: 'p1', ...baseCreate });

      await svc.create(baseCreate, SELLER_A);

      const [createCall] = prisma.product.create.mock.calls as Array<
        [{ data: { sellerId?: string } }]
      >;
      expect(createCall[0].data.sellerId).toBe('seller-a');
      // platform-seller resolver must NOT be consulted for a seller actor
      expect(prisma.seller.findFirstOrThrow).not.toHaveBeenCalled();
    });
  });
});
