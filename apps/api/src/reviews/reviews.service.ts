import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { AuditService } from '../audit/audit.service';
import { REVIEW_HIDDEN, REVIEW_UNHIDDEN } from '../audit/audit-actions';
import { REVIEW_PUBLISHED_EVENT } from './reviews.events';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { ListAdminReviewsDto } from './dto/list-admin-reviews.dto';

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

/** Admin-facing view: base fields plus moderation/ownership metadata. */
export type AdminReviewView = ReviewView & {
  productId: string;
  userId: string;
  isHidden: boolean;
  createdAt: Date;
};

/** Offset-paginated list envelope for admin moderation. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
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
    private readonly audit: AuditService,
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

  async adminList(
    dto: ListAdminReviewsDto,
  ): Promise<Paginated<AdminReviewView>> {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where: Prisma.ReviewWhereInput = {};
    if (dto.productId) where.productId = dto.productId;
    if (dto.isHidden === 'true') where.deletedAt = { not: null };
    else if (dto.isHidden === 'false') where.deletedAt = null;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          productId: true,
          userId: true,
          rating: true,
          title: true,
          body: true,
          isVerified: true,
          publishedAt: true,
          deletedAt: true,
          createdAt: true,
          author: { select: AUTHOR_SELECT },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        ...this.toView(r),
        productId: r.productId,
        userId: r.userId,
        isHidden: r.deletedAt !== null,
        createdAt: r.createdAt,
      })),
      page,
      pageSize,
      total,
    };
  }

  async hide(id: string, actorId: string): Promise<void> {
    await this.setHidden(id, true, actorId);
  }

  async unhide(id: string, actorId: string): Promise<void> {
    await this.setHidden(id, false, actorId);
  }

  private async setHidden(
    id: string,
    hidden: boolean,
    actorId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const review = await tx.review.findUnique({
        where: { id },
        select: { id: true, productId: true, deletedAt: true },
      });
      if (!review) throw new NotFoundException('Review not found.');
      const currentlyHidden = review.deletedAt !== null;
      if (currentlyHidden === hidden) return; // idempotent no-op
      await tx.review.update({
        where: { id },
        data: hidden
          ? { publishedAt: null, deletedAt: new Date() }
          : { publishedAt: new Date(), deletedAt: null },
      });
      await this.products.recomputeRating(review.productId, tx);
      await this.audit.record(
        {
          actorId,
          action: hidden ? REVIEW_HIDDEN : REVIEW_UNHIDDEN,
          entityType: 'Review',
          entityId: id,
        },
        tx,
      );
    });
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
