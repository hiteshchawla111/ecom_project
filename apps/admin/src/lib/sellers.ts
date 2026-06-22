import { apiClient } from './apiClient';

/** Mirrors the API SellerStatus enum. */
export type SellerStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

/** A row in the admin seller list (mirrors API SellerListRow). */
export interface SellerListRow {
  id: string;
  displayName: string;
  slug: string;
  status: SellerStatus;
  kycPresent: boolean;
  createdAt: string; // ISO string over the wire
}

/** Full seller detail, masked — no raw KYC (mirrors API SellerView). */
export interface SellerView {
  id: string;
  displayName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  status: SellerStatus;
  kycVerifiedAt: string | null;
  bankAccountLast4: string | null; // e.g. '••••1234'
  gstinPresent: boolean;
  panPresent: boolean;
  bankIfscPresent: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Paginated envelope mirroring the API list response. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListSellersQuery {
  page?: number;
  pageSize?: number;
  status?: SellerStatus;
}

/** Build a query string from defined params only. */
function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** List all sellers (ADMIN). */
export function listSellers(
  query: ListSellersQuery = {},
): Promise<Paginated<SellerListRow>> {
  const path = `/admin/sellers${toQuery({
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
  })}`;
  return apiClient.request<Paginated<SellerListRow>>(path);
}

/** Fetch a single seller's masked detail (ADMIN). */
export function getSeller(id: string): Promise<SellerView> {
  return apiClient.request<SellerView>(`/admin/sellers/${id}`);
}

/**
 * Update a seller's status (ADMIN). Returns the updated seller view.
 * Optionally include a reason (required by some transitions, e.g. SUSPENDED).
 */
export function updateSellerStatus(
  id: string,
  status: SellerStatus,
  reason?: string,
): Promise<SellerView> {
  return apiClient.request<SellerView>(`/admin/sellers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(reason !== undefined ? { status, reason } : { status }),
  });
}
