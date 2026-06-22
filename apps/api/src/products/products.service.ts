import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Product, ProductStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  ListProductsDto,
  ProductSortBy,
  SortDir,
} from './dto/list-products.dto';
import { resolvePlatformSellerId } from './platform-seller';
import { buildSellerScope, ScopeActor } from './seller-scope';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

/** Paginated list envelope returned by list endpoints. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Relations included when returning a single product. */
const PRODUCT_INCLUDE = {
  category: true,
  images: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto, actor: ScopeActor): Promise<Product> {
    const sellerId =
      actor.role === Role.SELLER && actor.sellerId
        ? actor.sellerId
        : await resolvePlatformSellerId(this.prisma);
    try {
      return await this.prisma.product.create({
        data: {
          name: dto.name,
          sku: dto.sku,
          description: dto.description,
          price: dto.price,
          salePrice: dto.salePrice,
          brand: dto.brand,
          categoryId: dto.categoryId,
          status: dto.status,
          sellerId,
        },
      });
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  async findOne(id: string, actor: ScopeActor): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null, ...buildSellerScope(actor) },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async list(
    query: ListProductsDto,
    actor: ScopeActor,
  ): Promise<Paginated<Product>> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where = this.buildWhere(query, actor);
    const orderBy = this.buildOrderBy(query);

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: PRODUCT_INCLUDE,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** Translates list filters into a Prisma `where` (always excludes soft-deleted). */
  private buildWhere(
    query: ListProductsDto,
    actor: ScopeActor,
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...buildSellerScope(actor),
    };

    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [
        { name: contains },
        { sku: contains },
        { description: contains },
      ];
    }
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.status) where.status = query.status;

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
      };
    }

    return where;
  }

  /** Whitelisted sort column + direction; defaults to newest-first. */
  private buildOrderBy(
    query: ListProductsDto,
  ): Prisma.ProductOrderByWithRelationInput {
    const column = query.sortBy ?? ProductSortBy.CreatedAt;
    const dir = query.sortDir ?? SortDir.Desc;
    return { [column]: dir };
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    actor: ScopeActor,
  ): Promise<Product> {
    await this.ensureExists(id, actor);
    try {
      return await this.prisma.product.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price,
          salePrice: dto.salePrice,
          brand: dto.brand,
          categoryId: dto.categoryId,
        },
      });
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  async archive(id: string, actor: ScopeActor): Promise<Product> {
    await this.ensureExists(id, actor);
    return this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.ARCHIVED },
    });
  }

  async setActive(
    id: string,
    active: boolean,
    actor: ScopeActor,
  ): Promise<Product> {
    await this.ensureExists(id, actor);
    return this.prisma.product.update({
      where: { id },
      data: {
        status: active ? ProductStatus.ACTIVE : ProductStatus.INACTIVE,
      },
    });
  }

  /** Confirms a non-soft-deleted product exists within the actor's scope, else 404. */
  private async ensureExists(id: string, actor: ScopeActor): Promise<void> {
    const found = await this.prisma.product.findFirst({
      where: { id, deletedAt: null, ...buildSellerScope(actor) },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Product not found');
  }

  /** Translates known Prisma write errors into HTTP-meaningful exceptions. */
  private mapWriteError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        // Unique violation is now on (sku, sellerId): a seller already has this SKU.
        return new ConflictException('A product with this SKU already exists');
      }
      if (err.code === 'P2003' || err.code === 'P2025') {
        return new BadRequestException('Referenced category does not exist');
      }
    }
    return err instanceof Error ? err : new Error('Unknown error');
  }
}
