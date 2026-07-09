import { NextResponse } from 'next/server';
import { handleUnreadCount } from '../handlers';
import { liveNotificationsRouteDeps } from '../route-deps';

export async function GET() {
  const result = await handleUnreadCount(liveNotificationsRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}
