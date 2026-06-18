import { NextResponse } from 'next/server';
import { handlePlaceOrder } from './handlers';
import { liveOrdersRouteDeps } from './route-deps';

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handlePlaceOrder(
    {
      shipFullName: input.shipFullName as string,
      shipLine1: input.shipLine1 as string,
      shipLine2: input.shipLine2 as string | undefined,
      shipCity: input.shipCity as string,
      shipState: input.shipState as string,
      shipCountry: input.shipCountry as string,
      shipPostalCode: input.shipPostalCode as string,
    },
    liveOrdersRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
