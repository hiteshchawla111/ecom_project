import { NextResponse } from 'next/server';
import type { UpdateSellerInput } from '@/lib/seller';
import { handleGetSellerMe, handleSellerUpdate } from '../handlers';
import { liveSellerRouteDeps } from '../route-deps';

export async function GET() {
  const result = await handleGetSellerMe(await liveSellerRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(req: Request) {
  const input = (await req.json().catch(() => ({}))) as UpdateSellerInput;
  const result = await handleSellerUpdate(input, await liveSellerRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}
