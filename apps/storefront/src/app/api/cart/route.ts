import { NextResponse } from 'next/server';
import { handleGetCart, handleClearCart } from './handlers';
import { liveCartRouteDeps } from './route-deps';

export async function GET() {
  const result = await handleGetCart(liveCartRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE() {
  const result = await handleClearCart(liveCartRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}
