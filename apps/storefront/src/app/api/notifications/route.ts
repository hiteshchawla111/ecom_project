import { NextResponse } from 'next/server';
import { handleList } from './handlers';
import { liveNotificationsRouteDeps } from './route-deps';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const num = (k: string) => { const v = url.searchParams.get(k); return v === null ? undefined : Number(v); };
  const unreadRaw = url.searchParams.get('unread');
  const result = await handleList(
    { page: num('page'), pageSize: num('pageSize'), unread: unreadRaw === null ? undefined : unreadRaw === 'true' },
    liveNotificationsRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
