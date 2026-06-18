// Test-only stub for `next/navigation`.
// Tests that need a spy override this with vi.mock('next/navigation', ...) per file.
export function useRouter() {
  return { push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} };
}
export function useSearchParams() {
  return new URLSearchParams();
}
export function usePathname() {
  return '/';
}
