/** Return an in-app relative path, or '/' if the input could be an open redirect. */
export function safeNext(raw: string | undefined): string {
  if (typeof raw !== 'string') return '/';
  if (!raw.startsWith('/')) return '/';
  // Reject protocol-relative ("//host") and backslash ("/\host") forms — both
  // can be read as an absolute URL by some redirect consumers.
  if (/^\/[/\\]/.test(raw)) return '/';
  return raw;
}
