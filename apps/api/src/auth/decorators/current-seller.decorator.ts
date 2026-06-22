import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/** Pure extractor — unit-testable without Nest's decorator machinery. */
export function extractSellerId(req: { sellerId?: string }): string {
  if (!req.sellerId) {
    throw new ForbiddenException('Seller context missing');
  }
  return req.sellerId;
}

/**
 * Resolves the acting seller's id, set on the request by SellerApprovedGuard.
 * Only valid on routes guarded by SellerApprovedGuard with an ACTIVE seller;
 * throws if absent (a wiring error — never a silent unscoped value).
 */
export const CurrentSeller = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    extractSellerId(ctx.switchToHttp().getRequest<{ sellerId?: string }>()),
);
