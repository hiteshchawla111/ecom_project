import { NextResponse } from 'next/server';
import { handleCreateReview, handleListReviews } from './handlers';
import { liveReviewsRouteDeps } from './route-deps';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const result = await handleListReviews(
    id,
    {
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    },
    liveReviewsRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleCreateReview(
    id,
    {
      rating: input.rating as number | undefined,
      title: input.title as string | undefined,
      body: input.body as string | undefined,
    },
    liveReviewsRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
