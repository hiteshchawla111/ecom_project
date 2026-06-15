// Test-only stub for `next/headers`. The pure session logic (resolveSession,
// cookieOptions) is what unit tests exercise; the cookies()-bound wrappers are
// thin glue covered by E2E. This stub lets the module import under Vitest.
export async function cookies() {
  throw new Error('next/headers cookies() is not available under Vitest');
}
