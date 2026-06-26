import '@testing-library/jest-dom/vitest';
import { vi, afterEach } from 'vitest';

// @testing-library/dom's waitFor detects fake timers by checking `typeof jest`.
// Vitest doesn't expose a `jest` global, so waitFor falls back to real setInterval
// polling — which never fires when fake timers are active. Aliasing vi → jest here
// makes jestFakeTimersAreEnabled() return true so waitFor advances the fake clock
// (via jest.advanceTimersByTime) on each polling iteration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).jest = vi;

// Ensure fake timers are restored to real timers BEFORE @testing-library/react's
// cleanup afterEach runs. Cleanup uses React's scheduler (which calls setTimeout)
// and needs real timers to unmount components properly when tests use vi.useFakeTimers().
// This afterEach is registered before the test file's afterEach hooks, so it runs first.
afterEach(() => {
  vi.useRealTimers();
});
