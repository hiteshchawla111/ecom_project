import { NextResponse } from 'next/server';
import { handleConfirmReset } from '../../handlers';
import { liveRouteDeps } from '../../route-deps';

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleConfirmReset(
    { token: input.token as string, password: input.password as string },
    liveRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
