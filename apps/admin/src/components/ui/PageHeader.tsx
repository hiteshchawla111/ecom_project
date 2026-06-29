import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** Small uppercase eyebrow above the title. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Right-aligned actions (buttons/links). */
  actions?: ReactNode;
}

/**
 * Consistent admin page header — serif title with an optional eyebrow and
 * right-aligned actions, on a hairline divider. Keeps every page visually
 * aligned with the dashboard.
 */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div className="flex flex-col gap-1.5">
        {eyebrow && (
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-content-subtle">
            {eyebrow}
          </span>
        )}
        <h2 className="font-serif text-3xl font-medium tracking-tight text-content">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-content-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Primary near-black button styling (shared across admin pages). */
// Primary uses the brand color with white text — readable and intentional in
// BOTH light and dark themes (the content/surface tokens invert per-theme and
// can wash out, so we don't use them for filled buttons).
export const primaryBtn =
  'inline-flex items-center bg-primary-600 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors duration-300 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

/** Secondary (outline) button styling. */
export const secondaryBtn =
  'inline-flex items-center border border-line px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-content transition-colors duration-300 hover:border-content hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700';
