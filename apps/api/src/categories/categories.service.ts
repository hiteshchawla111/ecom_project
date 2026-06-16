import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/** A category with its descendants nested under `children`. */
export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
}

/** Relations included when returning a single category. */
const CATEGORY_INCLUDE = {
  parent: true,
  children: { where: { deletedAt: null } },
} satisfies Prisma.CategoryInclude;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) await this.ensureExists(dto.parentId, 'parent');
    try {
      return await this.prisma.category.create({
        data: { name: dto.name, slug: dto.slug, parentId: dto.parentId },
      });
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  /** Resolve a non-deleted category by its id or its (unique) slug. */
  async findOne(idOrSlug: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], deletedAt: null },
      include: CATEGORY_INCLUDE,
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  /** All non-deleted categories assembled into a nested tree of roots. */
  async tree(): Promise<CategoryTreeNode[]> {
    const flat = await this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });

    const byId = new Map<string, CategoryTreeNode>();
    for (const c of flat) byId.set(c.id, { ...c, children: [] });

    const roots: CategoryTreeNode[] = [];
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.ensureExists(id);

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      await this.assertNoCycle(id, dto.parentId);
    }

    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug,
          // Tri-state: undefined leaves it unchanged; null detaches to root.
          ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        },
      });
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  /** Soft-delete; blocked while the category still has children or products. */
  async remove(id: string): Promise<Category> {
    await this.ensureExists(id);

    const [childCount, productCount] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id, deletedAt: null } }),
      this.prisma.product.count({ where: { categoryId: id, deletedAt: null } }),
    ]);
    if (childCount > 0) {
      throw new ConflictException(
        'Cannot delete a category that has subcategories; reparent or delete them first',
      );
    }
    if (productCount > 0) {
      throw new ConflictException(
        'Cannot delete a category that still has products; move them first',
      );
    }

    return this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Confirms a non-soft-deleted category exists, else 404 (or 400 for a parent). */
  private async ensureExists(
    id: string,
    role: 'self' | 'parent' = 'self',
  ): Promise<void> {
    const found = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (found) return;
    if (role === 'parent') {
      throw new BadRequestException('Parent category does not exist');
    }
    throw new NotFoundException('Category not found');
  }

  /**
   * Rejects reparenting `subjectId` under `targetParentId` when the target is
   * the subject itself or one of its descendants (which would create a cycle).
   * Walks the target's ancestor chain; a hit on the subject means a cycle.
   */
  private async assertNoCycle(
    subjectId: string,
    targetParentId: string,
  ): Promise<void> {
    let cursor: string | null = targetParentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === subjectId) {
        throw new BadRequestException(
          'Cannot move a category under one of its own descendants',
        );
      }
      if (seen.has(cursor)) break; // defensive: pre-existing data cycle
      seen.add(cursor);
      const node: { parentId: string | null } | null =
        await this.prisma.category.findFirst({
          where: { id: cursor, deletedAt: null },
          select: { parentId: true },
        });
      if (!node) {
        throw new BadRequestException('Parent category does not exist');
      }
      cursor = node.parentId;
    }
  }

  /** Translates known Prisma write errors into HTTP-meaningful exceptions. */
  private mapWriteError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return new ConflictException(
          'A category with this slug already exists',
        );
      }
      if (err.code === 'P2003' || err.code === 'P2025') {
        return new BadRequestException('Parent category does not exist');
      }
    }
    return err instanceof Error ? err : new Error('Unknown error');
  }
}
