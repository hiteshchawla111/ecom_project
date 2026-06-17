export interface StatCardProps {
  label: string;
  /** Pre-formatted value, or "—" when not yet available. */
  value: string;
  /** Optional muted footnote (e.g. "Coming soon"). */
  hint?: string;
}

/** A single dashboard metric card. Presentational; value is pre-formatted. */
export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-neutral-200 bg-neutral-0 p-4">
      <span className="text-sm text-neutral-600">{label}</span>
      <span className="font-heading text-2xl font-semibold text-neutral-900">
        {value}
      </span>
      {hint && <span className="text-xs text-neutral-400">{hint}</span>}
    </div>
  );
}
