export interface PaginationProps {
  /** Current 1-based page. */
  page: number;
  /** Total number of pages (>= 1). */
  totalPages: number;
  /** Total item count, for the "Showing X–Y of N" summary. */
  total: number;
  /** Page size, for the summary range math. */
  pageSize: number;
  /** Called with the target page when the user navigates. */
  onPageChange: (page: number) => void;
  /** Visible page numbers on each side of the current page (default 1). */
  siblingCount?: number;
}

type PageToken = number | 'ellipsis';

const numberClass =
  'inline-flex h-9 min-w-9 items-center justify-center border border-line px-3 text-xs font-medium tabular-nums text-content transition-colors hover:border-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';
const currentClass =
  'inline-flex h-9 min-w-9 items-center justify-center bg-content px-3 text-xs font-medium tabular-nums text-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';
const stepClass =
  'inline-flex h-9 items-center justify-center border border-line px-3 text-[0.7rem] font-medium uppercase tracking-[0.1em] text-content transition-colors hover:border-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-40 disabled:hover:border-line';

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
 * State-driven numbered pagination for the admin SPA. Renders numbered page
 * buttons (with ellipsis windowing), Previous/Next, and a "Showing X–Y of N"
 * summary. The summary is always shown; page buttons appear only when there is
 * more than one page.
 */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  siblingCount = 1,
}: PaginationProps) {
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const tokens = totalPages > 1 ? buildPages(page, totalPages, siblingCount) : [];

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-sm text-content-muted">
        Showing {rangeStart}–{rangeEnd} of {total}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className={stepClass}
          >
            Prev
          </button>

          {tokens.map((token, i) =>
            token === 'ellipsis' ? (
              <span
                key={`ellipsis-${i}`}
                aria-hidden="true"
                className="inline-flex h-9 min-w-9 items-center justify-center px-1 text-xs text-content-subtle"
              >
                …
              </span>
            ) : (
              <button
                key={token}
                type="button"
                aria-label={`Page ${token}`}
                aria-current={token === page ? 'page' : undefined}
                onClick={() => onPageChange(token)}
                className={token === page ? currentClass : numberClass}
              >
                {token}
              </button>
            ),
          )}

          <button
            type="button"
            aria-label="Next page"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className={stepClass}
          >
            Next
          </button>
        </div>
      )}
    </nav>
  );
}
