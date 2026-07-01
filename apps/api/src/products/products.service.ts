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
export const PRODUCT_INCLUDE = {
  category: true,
  images: { orderBy: { position: 'asc' as const } },
  // The owning seller — public-safe fields only (shop name + slug; never KYC/PII).
  seller: { select: { displayName: true, slug: true } },
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
          // Provision the stock ledger row atomically — a product is immediately
          // manageable in inventory (zero stock until an ADDITION is posted).
          // sellerId mirrors the product's owner (the inventory scope filters on it).
          inventory: {
            create: {
              sellerId,
              available: 0,
              reserved: 0,
              lowStockThreshold: 0,
            },
          },
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
    filter?: { sellerId?: string },
  ): Promise<Paginated<Product>> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where = this.buildWhere(query, actor, filter);
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
    filter?: { sellerId?: string },
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...buildSellerScope(actor),
    };

    // Explicit, caller-supplied seller filter (e.g. a public seller storefront
    // listing). Distinct from buildSellerScope, which confines the *actor*.
    if (filter?.sellerId) where.sellerId = filter.sellerId;

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

  /**
   * Recompute the denormalized rating aggregate for a product from its VISIBLE
   * reviews, on the caller's transaction. Kept in-tx with every review
   * create/hide/unhide so the aggregate can never drift (M4a design decision).
   */
  async recomputeRating(
    productId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const agg = await tx.review.aggregate({
      where: { productId, publishedAt: { not: null }, deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.product.update({
      where: { id: productId },
      data: {
        ratingAvg: agg._avg.rating, // number | null → Prisma Decimal column
        ratingCount: agg._count._all,
      },
    });
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
