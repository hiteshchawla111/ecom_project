import { NextResponse } from 'next/server';
import { handleRequestReset } from '../../handlers';
import { liveRouteDeps } from '../../route-deps';

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleRequestReset(
    { email: input.email as string },
    liveRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
