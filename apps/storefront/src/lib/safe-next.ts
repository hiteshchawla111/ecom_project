/** Return an in-app relative path, or '/' if the input could be an open redirect. */
export function safeNext(raw: string | undefined): string {
  if (typeof raw !== 'string') return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  return raw;
}
