import { NextResponse } from 'next/server';
import { handleLogout } from '../handlers';
import { liveRouteDeps } from '../route-deps';

export async function POST() {
  const result = await handleLogout(liveRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}
