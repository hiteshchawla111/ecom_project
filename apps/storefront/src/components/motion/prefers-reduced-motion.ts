/**
 * True when the user has asked the OS to reduce motion. Defensive against
 * environments where `matchMedia` is unavailable (jsdom in tests, very old
 * browsers): when it can't be determined, we err toward *reducing* motion so
 * animation is opt-in, never forced.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
