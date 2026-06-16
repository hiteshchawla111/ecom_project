import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CategoriesService } from './categories.service';

const makePrisma = () => ({
  category: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  product: {
    count: jest.fn(),
  },
});

const build = () => {
  const prisma = makePrisma();
  const svc = new CategoriesService(prisma as never);
  return { svc, prisma };
};

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(code, {
    code,
    clientVersion: 'x',
  });

describe('CategoriesService', () => {
  describe('create', () => {
    it('creates a root category', async () => {
      const { svc, prisma } = build();
      prisma.category.create.mockResolvedValue({ id: 'c1', name: 'Books' });

      const res = await svc.create({ name: 'Books', slug: 'books' });

      const [call] = prisma.category.create.mock.calls as Array<
        [{ data: { slug: string; parentId?: string } }]
      >;
      expect(call[0].data).toEqual(expect.objectContaining({ slug: 'books' }));
      expect(res).toEqual(expect.objectContaining({ id: 'c1' }));
    });

    it('creates a child under an existing parent', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue({ id: 'parent' });
      prisma.category.create.mockResolvedValue({
        id: 'c2',
        parentId: 'parent',
      });

      await svc.create({
        name: 'Fiction',
        slug: 'fiction',
        parentId: 'parent',
      });

      const [call] = prisma.category.create.mock.calls as Array<
        [{ data: { parentId?: string } }]
      >;
      expect(call[0].data.parentId).toBe('parent');
    });

    it('rejects a child whose parent does not exist with 400', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue(null);
      await expect(
        svc.create({ name: 'X', slug: 'x', parentId: 'ghost' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate slug with 409', async () => {
      const { svc, prisma } = build();
      prisma.category.create.mockRejectedValue(knownError('P2002'));
      await expect(
        svc.create({ name: 'Books', slug: 'books' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findOne', () => {
    it('returns a non-deleted category with parent and children', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue({ id: 'c1' });
      await expect(svc.findOne('c1')).resolves.toEqual(
        expect.objectContaining({ id: 'c1' }),
      );
      const [call] = prisma.category.findFirst.mock.calls as Array<
        [{ where: unknown; include?: unknown }]
      >;
      expect(call[0].where).toEqual({ id: 'c1', deletedAt: null });
      expect(call[0].include).toBeDefined();
    });

    it('throws 404 for a missing category', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue(null);
      await expect(svc.findOne('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('tree', () => {
    it('assembles a nested tree from a flat, non-deleted query', async () => {
      const { svc, prisma } = build();
      prisma.category.findMany.mockResolvedValue([
        { id: 'root', name: 'Root', parentId: null },
        { id: 'child', name: 'Child', parentId: 'root' },
        { id: 'grand', name: 'Grand', parentId: 'child' },
        { id: 'root2', name: 'Root2', parentId: null },
      ]);

      const tree = await svc.tree();

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
      expect(tree).toHaveLength(2);
      const root = tree.find((c) => c.id === 'root')!;
      expect(root.children.map((c) => c.id)).toEqual(['child']);
      expect(root.children[0].children.map((c) => c.id)).toEqual(['grand']);
      const root2 = tree.find((c) => c.id === 'root2')!;
      expect(root2.children).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates name/slug on an existing category', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue({
        id: 'c1',
        parentId: null,
      });
      prisma.category.update.mockResolvedValue({ id: 'c1', name: 'New' });

      const res = await svc.update('c1', { name: 'New' });

      const [call] = prisma.category.update.mock.calls as Array<
        [{ where: { id: string }; data: { name?: string } }]
      >;
      expect(call[0].where).toEqual({ id: 'c1' });
      expect(res).toEqual(expect.objectContaining({ name: 'New' }));
    });

    it('throws 404 updating a missing category', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue(null);
      await expect(svc.update('nope', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('detaches to root when parentId is null', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue({ id: 'c1', parentId: 'p' });
      prisma.category.update.mockResolvedValue({ id: 'c1', parentId: null });

      await svc.update('c1', { parentId: null });

      const [call] = prisma.category.update.mock.calls as Array<
        [{ data: { parentId?: string | null } }]
      >;
      expect(call[0].data.parentId).toBeNull();
    });

    it('rejects making a category its own parent with 400', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue({ id: 'c1', parentId: null });
      await expect(svc.update('c1', { parentId: 'c1' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('rejects reparenting under one of its own descendants (cycle) with 400', async () => {
      const { svc, prisma } = build();
      // Subject c1; we try to move it under c3, which is c1 -> c2 -> c3.
      // ensureExists(c1) -> first findFirst; then walk ancestors of target c3.
      prisma.category.findFirst
        .mockResolvedValueOnce({ id: 'c1', parentId: null }) // ensureExists(c1)
        .mockResolvedValueOnce({ id: 'c3', parentId: 'c2' }) // target c3
        .mockResolvedValueOnce({ id: 'c2', parentId: 'c1' }); // c2 -> c1 == subject => cycle

      await expect(svc.update('c1', { parentId: 'c3' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('allows a valid reparent (target not a descendant)', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst
        .mockResolvedValueOnce({ id: 'c1', parentId: null }) // ensureExists(c1)
        .mockResolvedValueOnce({ id: 'other', parentId: null }); // target 'other' is a root
      prisma.category.update.mockResolvedValue({ id: 'c1', parentId: 'other' });

      await svc.update('c1', { parentId: 'other' });

      const [call] = prisma.category.update.mock.calls as Array<
        [{ data: { parentId?: string | null } }]
      >;
      expect(call[0].data.parentId).toBe('other');
    });

    it('rejects a duplicate slug with 409', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue({ id: 'c1', parentId: null });
      prisma.category.update.mockRejectedValue(knownError('P2002'));
      await expect(svc.update('c1', { slug: 'taken' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes a category with no children and no products', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.category.count.mockResolvedValue(0);
      prisma.product.count.mockResolvedValue(0);
      prisma.category.update.mockResolvedValue({
        id: 'c1',
        deletedAt: new Date(),
      });

      await svc.remove('c1');

      const [call] = prisma.category.update.mock.calls as Array<
        [{ where: { id: string }; data: { deletedAt: Date } }]
      >;
      expect(call[0].where).toEqual({ id: 'c1' });
      expect(call[0].data.deletedAt).toBeInstanceOf(Date);
    });

    it('throws 404 removing a missing category', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue(null);
      await expect(svc.remove('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects removal when the category has non-deleted children (409)', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.category.count.mockResolvedValue(2);
      prisma.product.count.mockResolvedValue(0);
      await expect(svc.remove('c1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('rejects removal when the category still has products (409)', async () => {
      const { svc, prisma } = build();
      prisma.category.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.category.count.mockResolvedValue(0);
      prisma.product.count.mockResolvedValue(5);
      await expect(svc.remove('c1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });
  });
});
