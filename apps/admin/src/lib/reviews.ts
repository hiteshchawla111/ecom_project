import { apiClient } from './apiClient';

/** A row in the admin reviews moderation list (mirrors API AdminReviewView). */
export interface AdminReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  isVerified: boolean;
  authorName: string;
  publishedAt: string | null;
  productId: string;
  userId: string;
  isHidden: boolean;
  createdAt: string;
}

/** Paginated envelope mirroring the API list response. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** UI-facing visibility filter → API `isHidden` param. */
export type ReviewVisibility = 'all' | 'visible' | 'hidden';

export interface ListAdminReviewsQuery {
  page?: number;
  pageSize?: number;
  isHidden?: 'true' | 'false';
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

/** List reviews for moderation (ADMIN). */
export function listAdminReviews(
  query: ListAdminReviewsQuery = {},
): Promise<Paginated<AdminReview>> {
  const path = `/admin/reviews${toQuery({
    page: query.page,
    pageSize: query.pageSize,
    isHidden: query.isHidden,
  })}`;
  return apiClient.request<Paginated<AdminReview>>(path);
}

/** Soft-hide a review (ADMIN). 204, no body. */
export function hideReview(id: string): Promise<void> {
  return apiClient.request<void>(`/admin/reviews/${id}/hide`, { method: 'PATCH' });
}

/** Restore a hidden review (ADMIN). 204, no body. */
export function unhideReview(id: string): Promise<void> {
  return apiClient.request<void>(`/admin/reviews/${id}/unhide`, { method: 'PATCH' });
}
