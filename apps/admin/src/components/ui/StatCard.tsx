import type { ReactNode } from 'react';

export interface StatTrend {
  /** Direction of change — drives the arrow and color. */
  direction: 'up' | 'down';
  /** Human label, e.g. "6% vs last month". */
  label: string;
}

export interface StatCardProps {
  label: string;
  /** Pre-formatted value, or "—" when not yet available. */
  value: string;
  /** Optional muted footnote (e.g. "Coming soon"). */
  hint?: string;
  /** Optional decorative icon shown in a tinted chip (aria-hidden). */
  icon?: ReactNode;
  /** Optional trend footnote — direction is conveyed by arrow + text, never
   *  color alone (DESIGN.md accessibility rule). */
  trend?: StatTrend;
}

/**
 * A single dashboard metric card. Presentational; value is pre-formatted.
 * Icon and trend are optional so honest placeholder cards (value "—",
 * hint "Coming soon") render without fabricating a trend.
 */
export function StatCard({ label, value, hint, icon, trend }: StatCardProps) {
  const isUp = trend?.direction === 'up';

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-content-subtle">
          {label}
        </span>
        {icon && (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-600"
          >
            {icon}
          </span>
        )}
      </div>

      <span className="font-heading text-2xl font-semibold text-content">
        {value}
      </span>

      {trend && (
        <span
          className={`flex items-center gap-1 text-xs font-medium ${
            isUp ? 'text-success-500' : 'text-error-500'
          }`}
        >
          <span aria-hidden="true">{isUp ? '▲' : '▼'}</span>
          <span className="sr-only">{isUp ? 'Increase: ' : 'Decrease: '}</span>
          {trend.label}
        </span>
      )}

      {hint && <span className="text-xs text-content-subtle">{hint}</span>}
    </div>
  );
}
