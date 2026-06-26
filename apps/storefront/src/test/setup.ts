import '@testing-library/jest-dom/vitest';
import { vi, afterEach } from 'vitest';

// @testing-library/dom's waitFor detects fake timers by checking `typeof jest`.
// Vitest doesn't expose a `jest` global, so waitFor falls back to real setInterval
// polling — which never fires when fake timers are active. Aliasing vi → jest here
// makes jestFakeTimersAreEnabled() return true so waitFor advances the fake clock
// (via jest.advanceTimersByTime) on each polling iteration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).jest = vi;

// Ensure real timers are active before @testing-library/react's cleanup runs.
// RTL's cleanup uses React's scheduler (setTimeout) and needs real timers to
// unmount components properly after tests that call vi.useFakeTimers().
// (Vitest runs afterEach hooks LIFO — test-file hooks fire before this global one,
// so the test file is responsible for discarding pending timers before this restores.)
afterEach(() => {
  vi.useRealTimers();
});
