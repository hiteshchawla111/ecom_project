/** Stock-status badge — semantic tint + text (never color-only). Squared and
 *  uppercase to match the admin badge system. */
export function LowStockBadge({ low }: { low: boolean }) {
  const cls =
    'inline-flex items-center px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.1em]';
  if (!low) {
    return <span className={`${cls} bg-success-500/10 text-success-500`}>In stock</span>;
  }
  return (
    <span className={`${cls} bg-warning-500/10 text-warning-500`}>Low stock</span>
  );
}
