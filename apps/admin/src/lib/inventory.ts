import { apiClient } from './apiClient';

/** A row in the admin stock list (mirrors API StockRow). */
export interface StockRow {
  productId: string;
  name: string;
  sku: string;
  available: number;
  reserved: number;
  lowStockThreshold: number;
  isLowStock: boolean;
}

/** All ledger movement types (mirrors the API MovementType enum). */
export type MovementType =
  | 'ADDITION'
  | 'DEDUCTION'
  | 'ADJUSTMENT'
  | 'RESERVATION'
  | 'RELEASE';

/** The subset an admin / inventory manager may post manually. */
export type ManualMovementType = 'ADDITION' | 'DEDUCTION' | 'ADJUSTMENT';

/** A ledger movement as exposed to admins (mirrors API MovementView). */
export interface MovementView {
  type: MovementType;
  quantity: number;
  reason: string | null;
  orderId: string | null;
  createdAt: string;
}

/** A stock item's full detail: counters + product + recent movements. */
export interface StockItemView extends StockRow {
  movements: MovementView[];
}

/** Body for a manual stock movement (mirrors API CreateMovementDto). */
export interface CreateMovementInput {
  type: ManualMovementType;
  quantity: number;
  reason: string;
}

/** Paginated envelope mirroring the API list response. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListStockQuery {
  page?: number;
  pageSize?: number;
  lowStock?: boolean;
}

/**
 * Aggregate inventory health (mirrors the API InventoryReport). `valuation` is
 * money: a pre-formatted 2-dp string from the API — never compute or reformat
 * it client-side.
 */
export interface InventoryReport {
  totalProducts: number;
  totalAvailable: number;
  totalReserved: number;
  lowStockCount: number;
  outOfStockCount: number;
  valuation: string;
}

/** Build a query string from defined/truthy params only. */
function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** List inventory stock (ADMIN / INVENTORY_MANAGER). */
export function listStock(
  query: ListStockQuery = {},
): Promise<Paginated<StockRow>> {
  return apiClient.request<Paginated<StockRow>>(
    `/inventory${toQuery({
      page: query.page,
      pageSize: query.pageSize,
      // Only send lowStock when filtering; omit it otherwise.
      lowStock: query.lowStock ? 'true' : undefined,
    })}`,
  );
}

/** Fetch the cross-seller inventory report (ADMIN / INVENTORY_MANAGER). */
export function getInventoryReport(): Promise<InventoryReport> {
  return apiClient.request<InventoryReport>('/inventory/reports');
}

/** Fetch a product's stock detail + recent movements (ADMIN / INVENTORY_MANAGER). */
export function getStockItem(productId: string): Promise<StockItemView> {
  return apiClient.request<StockItemView>(`/inventory/${productId}`);
}

/** Post a manual stock movement (ADMIN / INVENTORY_MANAGER). Returns nothing (204). */
export function createMovement(
  productId: string,
  input: CreateMovementInput,
): Promise<void> {
  return apiClient.request<void>(`/inventory/${productId}/movements`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
