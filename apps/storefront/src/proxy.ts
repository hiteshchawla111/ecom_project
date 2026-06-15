import { NextResponse, type NextRequest } from 'next/server';
import { loginRedirectFor } from '@/lib/route-protection';

// Mirror of REFRESH_COOKIE in lib/session.ts. Kept inline because the proxy
// runs on the edge and must not import the `server-only`-guarded session module.
const REFRESH_COOKIE = 'sf_refresh';

export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has(REFRESH_COOKIE);
  const target = loginRedirectFor(req.nextUrl.pathname, hasSession);
  if (target) {
    const url = req.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/account/:path*'],
};
