import { useTheme } from '../../lib/useTheme';

/**
 * Light/dark theme toggle for the admin shell. Labels itself by the action it
 * performs (DESIGN.md / a11y: the control says what happens), so screen readers
 * announce "Switch to dark"/"Switch to light" rather than ambiguous state.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
    >
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
    </button>
  );
}
