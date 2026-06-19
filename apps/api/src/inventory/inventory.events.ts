/** Domain event emitted when a product's available stock crosses below its
 * configured low-stock threshold. Consumed by the notifications module. */
export const LOW_STOCK_EVENT = 'inventory.low-stock';

export interface LowStockEvent {
  productId: string;
  /** Available stock after the change that triggered the crossing. */
  available: number;
  /** The threshold that was crossed. */
  threshold: number;
}
