/** Visibility badge for a review — semantic tint + matching text (never color-only). */
export function ReviewStatusBadge({ isHidden }: { isHidden: boolean }) {
  const style = isHidden
    ? 'bg-line text-content-muted'
    : 'bg-success-500/10 text-success-500';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.1em] ${style}`}
    >
      {isHidden ? 'Hidden' : 'Visible'}
    </span>
  );
}
