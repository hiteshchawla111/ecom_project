import { NextResponse } from 'next/server';
import { handleMarkAll } from '../handlers';
import { liveNotificationsRouteDeps } from '../route-deps';

export async function PATCH() {
  const result = await handleMarkAll(liveNotificationsRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}
