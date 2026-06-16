import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';

const makePrisma = () => ({
  product: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
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

      const res = await svc.create(baseCreate);

      const [createCall] = prisma.product.create.mock.calls as Array<
        [{ data: { sku: string; categoryId: string } }]
      >;
      expect(createCall[0].data).toEqual(
        expect.objectContaining({ sku: 'WID-001', categoryId: 'cat1' }),
      );
      expect(res).toEqual(expect.objectContaining({ id: 'p1' }));
    });

    it('rejects a duplicate SKU with 409', async () => {
      const { svc, prisma } = build();
      prisma.product.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(svc.create(baseCreate)).rejects.toBeInstanceOf(
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
      await expect(svc.create(baseCreate)).rejects.toThrow();
    });
  });

  describe('findOne', () => {
    it('returns a product that exists and is not soft-deleted', async () => {
      const { svc, prisma } = build();
      prisma.product.findFirst.mockResolvedValue({ id: 'p1', deletedAt: null });
      await expect(svc.findOne('p1')).resolves.toEqual(
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
      await expect(svc.findOne('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('list', () => {
    it('returns a paginated envelope excluding soft-deleted, newest first', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      prisma.product.count.mockResolvedValue(2);

      const res = await svc.list({ page: 1, pageSize: 20 });

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

      await svc.list({ page: 3, pageSize: 10 });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('update', () => {
    it('updates an existing product', async () => {
      const { svc, prisma } = build();
      prisma.product.findFirst.mockResolvedValue({ id: 'p1', deletedAt: null });
      prisma.product.update.mockResolvedValue({ id: 'p1', name: 'New' });

      const res = await svc.update('p1', { name: 'New' });

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
      await expect(svc.update('nope', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
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

      const res = await svc.archive('p1');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: ProductStatus.ARCHIVED },
      });
      expect(res.status).toBe(ProductStatus.ARCHIVED);
    });

    it('throws 404 archiving a missing product', async () => {
      const { svc, prisma } = build();
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(svc.archive('nope')).rejects.toBeInstanceOf(
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

      await svc.setActive('p1', true);

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

      await svc.setActive('p1', false);

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: ProductStatus.INACTIVE },
      });
    });
  });
});
