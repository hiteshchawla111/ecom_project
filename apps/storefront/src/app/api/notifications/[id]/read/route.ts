import { NextResponse } from 'next/server';
import { handleMarkRead } from '../../handlers';
import { liveNotificationsRouteDeps } from '../../route-deps';

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await handleMarkRead(id, liveNotificationsRouteDeps());
  // 204 must not carry a JSON body
  if (result.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(result.body, { status: result.status });
}
