/**
 * Turn free-text autocomplete input into a safe Postgres prefix tsquery
 * string for `to_tsquery('english', …)`. Splitting on non-alphanumerics and
 * rebuilding the query ourselves is what keeps `to_tsquery` from throwing on
 * arbitrary user input (it rejects malformed query syntax). The last token
 * gets the `:*` prefix marker so a partially-typed word still matches.
 *
 * Returns `null` when there is no usable token (caller short-circuits to []).
 *
 * Examples: "auro" → "auro:*"; "aurora sma" → "aurora & sma:*";
 *           "!!!" → null; "" → null.
 */
export function buildPrefixTsQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return null;

  const lastIndex = tokens.length - 1;
  return tokens.map((t, i) => (i === lastIndex ? `${t}:*` : t)).join(' & ');
}
