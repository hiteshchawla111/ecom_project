import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

/** Minimal actor shape needed to scope a query to its owner. */
export interface ScopeActor {
  role: Role;
  /** The acting seller's id; required when role is SELLER, ignored otherwise. */
  sellerId?: string;
}

/**
 * Ownership-scoping rule (ADR-008). A SELLER is confined to their own rows;
 * ADMIN / INVENTORY_MANAGER are unscoped (cross-seller visibility). Returns a
 * Prisma `where` fragment to spread into a query's `where`.
 *
 * Fails closed: a SELLER actor with no resolved sellerId is a server-side
 * wiring error (the guard should have attached it), never a silent unscoped read.
 */
export function buildSellerScope(actor: ScopeActor): { sellerId?: string } {
  if (actor.role !== Role.SELLER) return {};
  if (!actor.sellerId) {
    throw new ForbiddenException('Seller context missing');
  }
  return { sellerId: actor.sellerId };
}
