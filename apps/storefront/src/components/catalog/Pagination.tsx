import Link from 'next/link';

export interface PaginationProps {
  /** Current 1-based page. */
  page: number;
  /** Total number of pages (>= 1). */
  totalPages: number;
  /** Total item count, for the "Showing X–Y of N" summary. */
  total: number;
  /** Page size, for the summary range math. */
  pageSize: number;
  /** Builds the href for a given page number (keeps the component URL-driven). */
  hrefForPage: (page: number) => string;
  /** Visible page numbers on each side of the current page (default 1). */
  siblingCount?: number;
}

type PageToken = number | 'ellipsis';

const numberLinkClass =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';
const currentClass =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-md bg-primary-500 px-3 text-sm font-semibold text-neutral-0';
const stepLinkClass =
  'inline-flex h-9 items-center justify-center rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';
const stepDisabledClass =
  'inline-flex h-9 items-center justify-center rounded-md border border-neutral-200 px-3 text-sm text-neutral-400';

/**
 * Build the list of page tokens with ellipses. Always includes page 1 and the
 * last page; shows a window of `siblingCount` pages around the current page;
 * inserts an 'ellipsis' token wherever there is a gap > 1 between shown pages.
 */
function buildPages(
  page: number,
  totalPages: number,
  siblingCount: number,
): PageToken[] {
  const start = Math.max(2, page - siblingCount);
  const end = Math.min(totalPages - 1, page + siblingCount);

  const pages: number[] = [1];
  for (let p = start; p <= end; p++) pages.push(p);
  if (totalPages > 1) pages.push(totalPages);

  const tokens: PageToken[] = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev > 1) tokens.push('ellipsis');
    tokens.push(p);
    prev = p;
  }
  return tokens;
}

/**
 * URL-driven numbered pagination. Renders numbered page links (with ellipsis
 * windowing), Previous/Next, and a "Showing X–Y of N" summary. Renders nothing
 * when there is a single page. Reused by `/products` and `/categories/[slug]`.
 */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  hrefForPage,
  siblingCount = 1,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const tokens = buildPages(page, totalPages, siblingCount);
  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-sm text-neutral-600">
        Showing {rangeStart}–{rangeEnd} of {total}
      </p>

      <div className="flex items-center gap-1">
        {page <= 1 ? (
          <span aria-disabled="true" aria-label="Previous page" className={stepDisabledClass}>
            Prev
          </span>
        ) : (
          <Link
            href={hrefForPage(page - 1)}
            rel="prev"
            aria-label="Previous page"
            className={stepLinkClass}
          >
            Prev
          </Link>
        )}

        {tokens.map((token, i) =>
          token === 'ellipsis' ? (
            <span
              key={`ellipsis-${i}`}
              aria-hidden="true"
              className="inline-flex h-9 min-w-9 items-center justify-center px-1 text-sm text-neutral-400"
            >
              …
            </span>
          ) : token === page ? (
            <span key={token} aria-current="page" className={currentClass}>
              {token}
            </span>
          ) : (
            <Link
              key={token}
              href={hrefForPage(token)}
              aria-label={`Page ${token}`}
              className={numberLinkClass}
            >
              {token}
            </Link>
          ),
        )}

        {page >= totalPages ? (
          <span aria-disabled="true" aria-label="Next page" className={stepDisabledClass}>
            Next
          </span>
        ) : (
          <Link
            href={hrefForPage(page + 1)}
            rel="next"
            aria-label="Next page"
            className={stepLinkClass}
          >
            Next
          </Link>
        )}
      </div>
    </nav>
  );
}
