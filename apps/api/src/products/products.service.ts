import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Product, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';

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

  async create(dto: CreateProductDto): Promise<Product> {
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
        },
      });
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async list(query: ListProductsDto): Promise<Paginated<Product>> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.product.count({ where: { deletedAt: null } }),
    ]);

    return {
      data,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    await this.ensureExists(id);
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

  async archive(id: string): Promise<Product> {
    await this.ensureExists(id);
    return this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.ARCHIVED },
    });
  }

  async setActive(id: string, active: boolean): Promise<Product> {
    await this.ensureExists(id);
    return this.prisma.product.update({
      where: { id },
      data: {
        status: active ? ProductStatus.ACTIVE : ProductStatus.INACTIVE,
      },
    });
  }

  /** Confirms a non-soft-deleted product exists, else 404. */
  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Product not found');
  }

  /** Translates known Prisma write errors into HTTP-meaningful exceptions. */
  private mapWriteError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return new ConflictException('A product with this SKU already exists');
      }
      if (err.code === 'P2003' || err.code === 'P2025') {
        return new BadRequestException('Referenced category does not exist');
      }
    }
    return err instanceof Error ? err : new Error('Unknown error');
  }
}
