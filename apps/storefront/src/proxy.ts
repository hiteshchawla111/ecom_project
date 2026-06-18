import { NextResponse, type NextRequest } from 'next/server';
import { guestRedirectFor, loginRedirectFor } from '@/lib/route-protection';

// Mirror of REFRESH_COOKIE in lib/session.ts. Kept inline because the proxy
// runs on the edge and must not import the `server-only`-guarded session module.
const REFRESH_COOKIE = 'sf_refresh';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(REFRESH_COOKIE);
  const target =
    loginRedirectFor(pathname, hasSession) ??
    guestRedirectFor(pathname, hasSession);
  if (target) {
    const url = req.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/account/:path*',
    '/cart',
    '/cart/:path*',
    '/checkout',
    '/orders',
    '/orders/:path*',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
  ],
};
