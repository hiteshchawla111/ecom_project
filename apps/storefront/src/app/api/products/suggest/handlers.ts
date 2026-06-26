import type { ProductSuggestion } from '@/lib/catalog';

export interface SuggestHandlerResult {
  status: number;
  body: unknown;
}

/** Injectable suggest op so the handler is testable without env/Next. */
export interface SuggestRouteDeps {
  suggest(query: { q: string; limit: number }): Promise<ProductSuggestion[]>;
}

const MIN_CHARS = 2;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

function clampLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(n)));
}

/**
 * Proxy for /products/suggest. Short/absent queries short-circuit to []. Any
 * upstream failure degrades to [] (200) so autocomplete never breaks the page.
 */
export async function handleSuggest(
  input: { q?: string; limit?: string },
  deps: SuggestRouteDeps,
): Promise<SuggestHandlerResult> {
  const q = (input.q ?? '').trim();
  if (q.length < MIN_CHARS) return { status: 200, body: [] };
  try {
    const result = await deps.suggest({ q, limit: clampLimit(input.limit) });
    return { status: 200, body: result };
  } catch (err) {
    console.error('[suggest] upstream failure:', err);
    return { status: 200, body: [] };
  }
}
