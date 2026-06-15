import { NextResponse } from 'next/server';
import { handleRegister } from '../handlers';
import { liveRouteDeps } from '../route-deps';

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleRegister(
    {
      email: input.email as string,
      password: input.password as string,
      name: input.name as string,
    },
    liveRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
