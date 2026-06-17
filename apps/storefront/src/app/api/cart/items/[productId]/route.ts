import { NextResponse } from 'next/server';
import { handleSetQuantity, handleRemoveItem } from '../../handlers';
import { liveCartRouteDeps } from '../../route-deps';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleSetQuantity(productId, { quantity: input.quantity }, liveCartRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  const result = await handleRemoveItem(productId, liveCartRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}
