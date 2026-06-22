const DEV_DEFAULTS = ['http://localhost:5001', 'http://localhost:5002'];

/** Parse a comma-separated CORS allowlist from env; dev defaults when unset; never wildcard. */
export function parseOrigins(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [...DEV_DEFAULTS];
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0 && o !== '*');
  return origins.length > 0 ? origins : [...DEV_DEFAULTS];
}
