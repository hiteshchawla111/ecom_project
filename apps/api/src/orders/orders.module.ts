import { Module } from '@nestjs/common';

/**
 * Orders domain module.
 *
 * Owns the order lifecycle and its state-machine guard (`order-status.ts`).
 * Controllers/services land here in Phase 5; the status transition logic is
 * already test-driven and ready to back them.
 */
@Module({})
export class OrdersModule {}
