// Test-only stub for the `server-only` marker package. In `next build`, Next
// resolves the real module (which errors if imported into client code); under
// Vitest there is no such bundler boundary, so we alias it to a no-op.
export {};
