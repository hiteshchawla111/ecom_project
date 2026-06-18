import { NextResponse } from 'next/server';
import { handleAddItem } from '../handlers';
import { liveCartRouteDeps } from '../route-deps';

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleAddItem(
    { productId: input.productId, quantity: input.quantity },
    liveCartRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
