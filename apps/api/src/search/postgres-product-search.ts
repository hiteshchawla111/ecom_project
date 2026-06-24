import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPrefixTsQuery } from './build-prefix-tsquery';
import {
  ProductSearch,
  ProductSearchItem,
  ProductSearchResult,
  ProductSuggestion,
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

/**
 * Postgres GIN full-text implementation of `ProductSearch` (ADR-011).
 * Two steps: (1) raw parameterized SQL ranks + paginates matching product IDs
 * (the `@@` filter matches the K2 index expression so the GIN index is used);
 * (2) Prisma hydrates the page with relations, re-sorted into rank order.
 * Public, ACTIVE-only, across all sellers. A blank query yields an empty page.
 */
@Injectable()
export class PostgresProductSearch implements ProductSearch {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    q: string,
    page: number,
    pageSize: number,
  ): Promise<ProductSearchResult> {
    const term = q.trim();
    if (term === '') {
      return { data: [], page, pageSize, total: 0, totalPages: 1 };
    }

    const offset = (page - 1) * pageSize;

    // $1 = user query (parameterized — no injection). The match expression is
    // identical to the K2 index expression; the rank expression is weighted
    // (name 'A' > description 'B') and computed only on candidate rows.
    const rows = await this.prisma.$queryRaw<RankedRow[]>`
      SELECT p.id,
             ts_rank(
               setweight(to_tsvector('english', p.name), 'A') ||
               setweight(to_tsvector('english', coalesce(p.description, '')), 'B'),
               websearch_to_tsquery('english', ${term})
             ) AS rank,
             count(*) OVER() AS total
      FROM "Product" p
      WHERE p."deletedAt" IS NULL
        AND p.status = 'ACTIVE'
        AND to_tsvector('english', p.name || ' ' || coalesce(p.description, ''))
            @@ websearch_to_tsquery('english', ${term})
      ORDER BY rank DESC, p."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    if (rows.length === 0) {
      return { data: [], page, pageSize, total: 0, totalPages: 1 };
    }

    const total = Number(rows[0].total);
    const ids = rows.map((r) => r.id);

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: PRODUCT_SEARCH_INCLUDE,
    });

    // `IN (...)` does not preserve order — re-sort into the ranked id order.
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
    };
  }

  async suggest(q: string, limit: number): Promise<ProductSuggestion[]> {
    const tsquery = buildPrefixTsQuery(q);
    if (tsquery === null) return [];

    // $1 = sanitized prefix tsquery string (built from alphanumeric tokens only,
    // so to_tsquery never throws); $2 = limit. The @@ expression matches the K2
    // GIN index. Scalars only — no relation hydrate needed for a dropdown row.
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
