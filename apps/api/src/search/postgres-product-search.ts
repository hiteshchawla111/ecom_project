import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildPrefixTsQuery } from './build-prefix-tsquery';
import { buildSearchWhere, SearchFilters } from './search-filters';
import {
  ProductSearch,
  ProductSearchItem,
  ProductSearchResult,
  ProductSuggestion,
  SearchFacets,
  PRODUCT_SEARCH_INCLUDE,
} from './product-search';

/** One ranked, paginated row from the FTS query. */
interface RankedRow {
  id: string;
  rank: number;
  total: bigint;
}

/** One scalar row from the autocomplete query. */
interface RawSuggestRow {
  id: string;
  name: string;
  price: string;
  salePrice: string | null;
  rank: number;
}

interface BrandFacetRow {
  value: string;
  count: bigint;
}
interface CategoryFacetRow {
  categoryId: string;
  name: string;
  count: bigint;
}
interface PriceFacetRow {
  min: string | null;
  max: string | null;
}
interface RatingFacetRow {
  minRating: number;
  count: bigint;
}

const EMPTY_FACETS: SearchFacets = {
  brands: [],
  categories: [],
  price: null,
  ratings: [],
};

/**
 * Module-level helper: builds the UNION ALL rating-threshold query.
 * Reusing the same `where` fragment four times is safe — Prisma.sql re-emits
 * bound params for each interpolation.
 */
const RATING_FACET_SQL = (q: string, filters: SearchFilters): Prisma.Sql => {
  const where = buildSearchWhere(q, filters, 'rating');
  return Prisma.sql`
    SELECT 4 AS "minRating", count(*) FILTER (WHERE p."ratingAvg" >= 4) AS count FROM "Product" p ${where}
    UNION ALL SELECT 3, count(*) FILTER (WHERE p."ratingAvg" >= 3) FROM "Product" p ${where}
    UNION ALL SELECT 2, count(*) FILTER (WHERE p."ratingAvg" >= 2) FROM "Product" p ${where}
    UNION ALL SELECT 1, count(*) FILTER (WHERE p."ratingAvg" >= 1) FROM "Product" p ${where}
  `;
};

/**
 * Postgres GIN full-text implementation of `ProductSearch` (ADR-011).
 * Two steps: (1) raw parameterized SQL ranks + paginates matching product IDs
 * (the `@@` filter matches the K2 index expression so the GIN index is used);
 * (2) Prisma hydrates the page with relations, re-sorted into rank order.
 * Public, ACTIVE-only, across all sellers. A blank query with no filters yields
 * an empty page; a blank query with filters runs in browse mode.
 */
@Injectable()
export class PostgresProductSearch implements ProductSearch {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    q: string,
    page: number,
    pageSize: number,
    filters: SearchFilters = {},
  ): Promise<ProductSearchResult> {
    const term = q.trim();
    const hasFilters =
      filters.brand !== undefined ||
      filters.categoryId !== undefined ||
      filters.minPrice !== undefined ||
      filters.maxPrice !== undefined ||
      filters.minRating !== undefined;

    // Blank q with no filters preserves slice-1 behavior: empty, no DB hit.
    if (term === '' && !hasFilters) {
      return {
        data: [],
        page,
        pageSize,
        total: 0,
        totalPages: 1,
        facets: EMPTY_FACETS,
      };
    }

    const offset = (page - 1) * pageSize;
    const whereAll = buildSearchWhere(q, filters);

    // Results page: ranked, fully-filtered, with a window-function total.
    // Issued FIRST (the spec's mock depends on this order).
    const rows = await this.prisma.$queryRaw<RankedRow[]>(Prisma.sql`
      SELECT p.id,
             ts_rank(
               setweight(to_tsvector('english', p.name), 'A') ||
               setweight(to_tsvector('english', coalesce(p.description, '')), 'B'),
               websearch_to_tsquery('english', ${term})
             ) AS rank,
             count(*) OVER() AS total
      FROM "Product" p
      ${whereAll}
      ORDER BY rank DESC, p."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const total = rows.length === 0 ? 0 : Number(rows[0].total);

    // Disjunctive facet counts — each omits its own filter. Order: brand, category, price, rating.
    const [brandRows, categoryRows, priceRows, ratingRows] = await Promise.all([
      this.prisma.$queryRaw<BrandFacetRow[]>(Prisma.sql`
        SELECT p.brand AS value, count(*) AS count
        FROM "Product" p ${buildSearchWhere(q, filters, 'brand')} AND p.brand IS NOT NULL
        GROUP BY p.brand ORDER BY count DESC, p.brand ASC
      `),
      this.prisma.$queryRaw<CategoryFacetRow[]>(Prisma.sql`
        SELECT p."categoryId" AS "categoryId", c.name AS name, count(*) AS count
        FROM "Product" p JOIN "Category" c ON c.id = p."categoryId"
        ${buildSearchWhere(q, filters, 'category')}
        GROUP BY p."categoryId", c.name ORDER BY count DESC, c.name ASC
      `),
      this.prisma.$queryRaw<PriceFacetRow[]>(Prisma.sql`
        SELECT min(p.price)::text AS min, max(p.price)::text AS max
        FROM "Product" p ${buildSearchWhere(q, filters, 'price')}
      `),
      this.prisma.$queryRaw<RatingFacetRow[]>(RATING_FACET_SQL(q, filters)),
    ]);

    const facets: SearchFacets = {
      brands: brandRows.map((r) => ({
        value: r.value,
        count: Number(r.count),
      })),
      categories: categoryRows.map((r) => ({
        categoryId: r.categoryId,
        name: r.name,
        count: Number(r.count),
      })),
      price:
        priceRows[0]?.min != null && priceRows[0]?.max != null
          ? { min: priceRows[0].min, max: priceRows[0].max }
          : null,
      ratings: ratingRows.map((r) => ({
        minRating: r.minRating,
        count: Number(r.count),
      })),
    };

    if (rows.length === 0) {
      return { data: [], page, pageSize, total: 0, totalPages: 1, facets };
    }

    const ids = rows.map((r) => r.id);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: PRODUCT_SEARCH_INCLUDE,
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((p): p is ProductSearchItem => p !== undefined);

    return {
      data,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      facets,
    };
  }

  async suggest(q: string, limit: number): Promise<ProductSuggestion[]> {
    const tsquery = buildPrefixTsQuery(q);
    if (tsquery === null) return [];

    // The sanitized prefix tsquery (alphanumeric tokens only, so to_tsquery
    // never throws) is bound twice — for ts_rank and the @@ filter — then the
    // limit is the last param. The @@ expression matches the K2 GIN index.
    // Scalars only — no relation hydrate needed for a dropdown row.
    const rows = await this.prisma.$queryRaw<RawSuggestRow[]>`
      SELECT p.id, p.name, p.price, p."salePrice",
             ts_rank(
               setweight(to_tsvector('english', p.name), 'A') ||
               setweight(to_tsvector('english', coalesce(p.description, '')), 'B'),
               to_tsquery('english', ${tsquery})
             ) AS rank
      FROM "Product" p
      WHERE p."deletedAt" IS NULL
        AND p.status = 'ACTIVE'
        AND to_tsvector('english', p.name || ' ' || coalesce(p.description, ''))
            @@ to_tsquery('english', ${tsquery})
      ORDER BY rank DESC, p."createdAt" DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      price: r.price,
      salePrice: r.salePrice,
    }));
  }
}
