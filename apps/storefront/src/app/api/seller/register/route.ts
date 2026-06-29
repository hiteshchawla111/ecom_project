import { NextResponse } from 'next/server';
import { handleSellerRegister } from '../handlers';
import { liveSellerRouteDeps } from '../route-deps';

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleSellerRegister(
    {
      displayName: input.displayName as string,
      description: input.description as string | undefined,
      logoUrl: input.logoUrl as string | undefined,
    },
    await liveSellerRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
