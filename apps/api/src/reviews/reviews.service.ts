import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { REVIEW_PUBLISHED_EVENT } from './reviews.events';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';

export interface ReviewView {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  isVerified: boolean;
  authorName: string;
  publishedAt: Date | null;
}
export interface ReviewSummary {
  ratingAvg: string | null;
  ratingCount: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}
export interface PublicReviewList {
  data: ReviewView[];
  nextCursor: string | null;
  summary: ReviewSummary;
}

// name only — never email (PII). User model exposes a single `name` field.
const AUTHOR_SELECT = { name: true } as const;

const REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  isVerified: true,
  publishedAt: true,
  author: { select: AUTHOR_SELECT },
} as const;

type ReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  isVerified: boolean;
  publishedAt: Date | null;
  author: { name: string | null };
};

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly products: ProductsService,
    private readonly emitter: EventEmitter2,
  ) {}

  async create(
    productId: string,
    userId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewView> {
    if (!(await this.orders.hasDeliveredProduct(userId, productId))) {
      throw new ForbiddenException(
        'You can only review a product you have received.',
      );
    }
    const created = await this.prisma.$transaction(async (tx) => {
      let review: ReviewRow;
      try {
        review = await tx.review.create({
          data: {
            productId,
            userId,
            rating: dto.rating,
            title: dto.title ?? null,
            body: dto.body ?? null,
            isVerified: true,
            publishedAt: new Date(),
          },
          select: REVIEW_SELECT,
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictException(
            'You have already reviewed this product.',
          );
        }
        throw err;
      }
      await this.products.recomputeRating(productId, tx);
      return review;
    });
    // Post-commit: never emit on a rolled-back write (deferred emit).
    this.emitter.emit(REVIEW_PUBLISHED_EVENT, {
      reviewId: created.id,
      productId,
      rating: created.rating,
    });
    return this.toView(created);
  }

  async listPublic(
    productId: string,
    dto: ListReviewsDto,
  ): Promise<PublicReviewList> {
    const limit = dto.limit ?? 10;
    const where: Prisma.ReviewWhereInput = {
      productId,
      publishedAt: { not: null },
      deletedAt: null,
    };
    const cursorFilter = this.decodeCursor(dto.cursor);
    const rows = await this.prisma.review.findMany({
      where: cursorFilter ? { AND: [where, cursorFilter] } : where,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: REVIEW_SELECT,
    });
    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      nextCursor = `${last.publishedAt!.toISOString()}_${last.id}`;
      rows.length = limit;
    }
    return {
      data: rows.map((r) => this.toView(r)),
      nextCursor,
      summary: await this.summary(productId),
    };
  }

  private async summary(productId: string): Promise<ReviewSummary> {
    const where: Prisma.ReviewWhereInput = {
      productId,
      publishedAt: { not: null },
      deletedAt: null,
    };
    const [agg, grouped] = await Promise.all([
      this.prisma.review.aggregate({
        where,
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where,
        _count: { _all: true },
      }),
    ]);
    const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as Record<
      '1' | '2' | '3' | '4' | '5',
      number
    >;
    for (const g of grouped) {
      distribution[String(g.rating) as '1' | '2' | '3' | '4' | '5'] =
        g._count._all;
    }
    return {
      ratingAvg: agg._avg.rating === null ? null : agg._avg.rating.toFixed(2),
      ratingCount: agg._count._all,
      distribution,
    };
  }

  private decodeCursor(cursor?: string): Prisma.ReviewWhereInput | null {
    if (!cursor) return null;
    const idx = cursor.lastIndexOf('_');
    if (idx < 0) return null;
    const publishedAt = new Date(cursor.slice(0, idx));
    const id = cursor.slice(idx + 1);
    // Keyset "before" this row under publishedAt DESC, id DESC.
    return {
      OR: [
        { publishedAt: { lt: publishedAt } },
        { publishedAt, id: { lt: id } },
      ],
    };
  }

  private toView(r: ReviewRow): ReviewView {
    return {
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      isVerified: r.isVerified,
      authorName: r.author.name ?? 'Anonymous',
      publishedAt: r.publishedAt,
    };
  }
}
