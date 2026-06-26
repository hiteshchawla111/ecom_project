import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handleSuggest } from './handlers';
import { liveSuggestRouteDeps } from './route-deps';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const result = await handleSuggest(
    { q: params.get('q') ?? undefined, limit: params.get('limit') ?? undefined },
    liveSuggestRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
