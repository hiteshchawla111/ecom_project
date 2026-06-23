/** Low-stock pill — semantic warning tint + text (never color-only). */
export function LowStockBadge({ low }: { low: boolean }) {
  if (!low) {
    return <span className="text-xs text-content-subtle">OK</span>;
  }
  return (
    <span className="inline-flex items-center rounded-full bg-warning-500/10 px-2.5 py-0.5 text-xs font-medium text-warning-500">
      Low
    </span>
  );
}
